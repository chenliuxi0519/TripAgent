"""
Text embeddings via the configured OpenAI-compatible provider (default Zhipu
`embedding-3`), reached through the same endpoint family as the chat LLM.

Chosen over a local sentence-transformers model so the service stays light
(~no PyTorch download) and deploys cleanly on free cloud tiers with little RAM.
All vectors are L2-normalised float32 so a FAISS inner-product / L2 index gives
cosine-like similarity. If embeddings are unavailable, memory/RAG degrade to
keyword retrieval rather than failing.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

import numpy as np
from openai import AsyncOpenAI

from config import settings

logger = logging.getLogger("Trip Agent.embeddings")

_client: Optional[AsyncOpenAI] = None


def _get_client() -> Optional[AsyncOpenAI]:
    global _client
    if not settings.EMBEDDING_API_KEY:
        return None
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.EMBEDDING_API_KEY,
            base_url=settings.EMBEDDING_BASE_URL,
            max_retries=1,
        )
    return _client


def _normalise(vecs: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return (vecs / norms).astype("float32")


async def embed_texts(texts: list[str]) -> Optional[np.ndarray]:
    """Embed a batch of texts. Returns (n, dim) float32 array, or None on failure."""
    if not texts:
        return np.zeros((0, settings.EMBEDDING_DIM), dtype="float32")
    client = _get_client()
    if client is None:
        return None
    try:
        # OpenAI-compatible embedding endpoint accepts batches.
        resp = await client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=texts,
        )
        vecs = np.array([d.embedding for d in resp.data], dtype="float32")
        return _normalise(vecs)
    except Exception as exc:
        logger.warning("embedding failed (%d texts): %s", len(texts), exc)
        return None


async def embed_text(text: str) -> Optional[np.ndarray]:
    out = await embed_texts([text])
    if out is None or len(out) == 0:
        return None
    return out[0]
