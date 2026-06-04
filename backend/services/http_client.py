"""
Shared async HTTP client with sensible timeouts and lightweight retries.

A single AsyncClient is reused across the app (connection pooling) which is
important for stability and latency when several tools fire in one turn.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx

from config import settings

logger = logging.getLogger("Trip Agent.http")

_client: Optional[httpx.AsyncClient] = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.HTTP_TIMEOUT, connect=8.0),
            headers={"User-Agent": settings.USER_AGENT},
            follow_redirects=True,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


async def request_json(
    method: str,
    url: str,
    *,
    retries: int = 2,
    backoff: float = 0.6,
    **kwargs: Any,
) -> Optional[Any]:
    """GET/POST returning parsed JSON, or None on persistent failure.

    Never raises for network/HTTP errors — callers degrade gracefully so a
    single flaky upstream API can't take the whole agent down.
    """
    client = get_client()
    last_exc: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            resp = await client.request(method, url, **kwargs)
            if resp.status_code == 429 or resp.status_code >= 500:
                # transient — retry
                raise httpx.HTTPStatusError(
                    f"status {resp.status_code}", request=resp.request, response=resp
                )
            resp.raise_for_status()
            if not resp.content:
                return None
            return resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            last_exc = exc
            if attempt < retries:
                await asyncio.sleep(backoff * (2 ** attempt))
            else:
                logger.warning("request_json failed %s %s: %s", method, url, exc)
    return None


async def get_text(url: str, *, retries: int = 1, **kwargs: Any) -> Optional[str]:
    client = get_client()
    for attempt in range(retries + 1):
        try:
            resp = await client.get(url, **kwargs)
            resp.raise_for_status()
            return resp.text
        except httpx.HTTPError as exc:
            if attempt < retries:
                await asyncio.sleep(0.5 * (2 ** attempt))
            else:
                logger.warning("get_text failed %s: %s", url, exc)
    return None
