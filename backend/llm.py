"""
Shared LLM client (any OpenAI-compatible provider) with 429-aware retry.

Free LLM tiers are often rate-limited (a few requests/minute). A multi-step agent
turn issues several calls, so transient 429s are expected. `chat_with_retry`
honours the server's suggested retry delay (capped) so a turn completes reliably
instead of failing — at the cost of being a bit slower on the free tier.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Optional

from openai import AsyncOpenAI

from config import settings

logger = logging.getLogger("travelmind.llm")

_client: Optional[AsyncOpenAI] = None

# Cap any single backoff wait so a request never hangs too long.
_MAX_BACKOFF = 22.0


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,
            max_retries=0,  # we handle retries in chat_with_retry (avoid double retry)
        )
    return _client


def _retry_delay_from_error(exc: Exception) -> Optional[float]:
    m = re.search(r"retry in ([\d.]+)s", str(exc))
    if not m:
        m = re.search(r"retryDelay['\"]?:\s*['\"]?(\d+)", str(exc))
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    return None


def _is_retryable(exc: Exception) -> tuple[bool, str]:
    s = str(exc)
    if "429" in s or "RESOURCE_EXHAUSTED" in s:
        return True, "rate_limit"
    # transient network / server issues
    if any(k in s for k in ("Connection error", "Timeout", "timed out",
                            "Temporarily", "503", "502", "500")):
        return True, "transient"
    return False, ""


async def chat_with_retry(*, max_retries: int = 3, **kwargs):
    """chat.completions.create with backoff on 429 and transient network errors."""
    client = get_client()
    last_exc: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        try:
            return await client.chat.completions.create(**kwargs)
        except Exception as exc:
            last_exc = exc
            retryable, kind = _is_retryable(exc)
            if not retryable or attempt == max_retries:
                raise
            if kind == "rate_limit":
                delay = _retry_delay_from_error(exc) or (2.0 * (2 ** attempt))
            else:
                delay = 1.5 * (2 ** attempt)
            delay = min(delay + 0.5, _MAX_BACKOFF)
            logger.warning("LLM %s (attempt %d) — retrying in %.1fs",
                           kind, attempt + 1, delay)
            await asyncio.sleep(delay)
    raise last_exc  # pragma: no cover
