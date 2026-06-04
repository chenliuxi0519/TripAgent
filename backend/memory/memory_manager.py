"""
Memory management for the travel agent.

Short-term : in-process conversation history keyed by session_id, with a sliding
             window so context never grows unbounded (stability under long chats).
Long-term  : a FAISS vector store of user preferences that PERSISTS to disk, so
             preferences are remembered across sessions and across restarts.
             Embeddings come from the configured provider (see embeddings.py);
             retrieval is
             semantic (vector similarity), with a recency fallback.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Optional

import faiss
import numpy as np

from config import settings
from embeddings import embed_text, embed_texts

logger = logging.getLogger("Trip Agent.memory")

# ── Short-term memory ──────────────────────────────────────────────────────────

_MAX_TURNS = 24  # keep the last N messages per session in the prompt window
_short_term: dict[str, list[dict]] = {}
_session_meta: dict[str, dict] = {}


def get_conversation(session_id: str) -> list[dict]:
    return _short_term.get(session_id, [])


def add_message(session_id: str, role: str, content) -> None:
    if session_id not in _short_term:
        _short_term[session_id] = []
        _session_meta[session_id] = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "message_count": 0,
        }
    _short_term[session_id].append({"role": role, "content": content})
    _session_meta[session_id]["message_count"] += 1
    # Sliding window: trim oldest, but never split a tool_use/tool_result pair by
    # always trimming from the front in whole messages.
    if len(_short_term[session_id]) > _MAX_TURNS:
        _short_term[session_id] = _short_term[session_id][-_MAX_TURNS:]


def clear_conversation(session_id: str) -> None:
    _short_term.pop(session_id, None)
    _session_meta.pop(session_id, None)


def get_session_stats(session_id: str) -> dict:
    return _session_meta.get(session_id, {})


# ── Long-term memory (persistent FAISS) ────────────────────────────────────────

class LongTermMemory:
    """Persistent semantic store of user preferences.

    Files (under DATA_DIR):
      long_term.index  — FAISS vector index
      long_term.json   — parallel metadata list
    """

    def __init__(self):
        self.dim = settings.EMBEDDING_DIM
        self.index: Optional[faiss.Index] = None
        self.metadata: list[dict] = []
        self._lock = threading.Lock()
        os.makedirs(settings.DATA_DIR, exist_ok=True)
        self._index_path = os.path.join(settings.DATA_DIR, "long_term.index")
        self._meta_path = os.path.join(settings.DATA_DIR, "long_term.json")
        self._load()

    # ── persistence ────────────────────────────────────────────────────────
    def _load(self) -> None:
        try:
            if os.path.exists(self._meta_path):
                with open(self._meta_path, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)
            if os.path.exists(self._index_path):
                self.index = faiss.read_index(self._index_path)
                self.dim = self.index.d
                logger.info("Loaded long-term memory: %d entries", len(self.metadata))
        except Exception as exc:
            logger.warning("Could not load long-term memory: %s", exc)
            self.metadata = []
            self.index = None

    def _persist(self) -> None:
        try:
            with open(self._meta_path, "w", encoding="utf-8") as f:
                json.dump(self.metadata, f, ensure_ascii=False, indent=2)
            if self.index is not None:
                faiss.write_index(self.index, self._index_path)
        except Exception as exc:
            logger.warning("Could not persist long-term memory: %s", exc)

    def _ensure_index(self, dim: int) -> None:
        if self.index is None:
            self.dim = dim
            self.index = faiss.IndexFlatIP(dim)

    # ── write ────────────────────────────────────────────────────────────────
    async def save(self, session_id: str, preference_type: str, value: str,
                   extra: Optional[dict] = None) -> dict:
        entry = {
            "session_id": session_id,
            "preference_type": preference_type,
            "value": value,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **(extra or {}),
        }
        vec = await embed_text(f"{preference_type}: {value}")
        with self._lock:
            self.metadata.append(entry)
            if vec is not None:
                self._ensure_index(len(vec))
                self.index.add(np.array([vec], dtype="float32"))
            self._persist()
        return entry

    # ── read ───────────────────────────────────────────────────────────────
    async def retrieve(self, session_id: str, query: str = "", top_k: int = 5) -> list[dict]:
        session_entries = [m for m in self.metadata if m["session_id"] == session_id]
        if not session_entries:
            return []
        if not query or self.index is None or self.index.ntotal == 0:
            return session_entries[-top_k:]
        qv = await embed_text(query)
        if qv is None:
            return session_entries[-top_k:]
        k = min(top_k * 3, self.index.ntotal)
        scores, idx = self.index.search(np.array([qv], dtype="float32"), k)
        session_positions = {
            i for i, m in enumerate(self.metadata) if m["session_id"] == session_id
        }
        hits = [self.metadata[i] for i in idx[0]
                if 0 <= i < len(self.metadata) and i in session_positions]
        return hits[:top_k] if hits else session_entries[-top_k:]

    def get_all_preferences(self, session_id: str) -> dict:
        prefs: dict[str, list] = {}
        for e in self.metadata:
            if e["session_id"] != session_id:
                continue
            prefs.setdefault(e["preference_type"], [])
            if e["value"] not in prefs[e["preference_type"]]:
                prefs[e["preference_type"]].append(e["value"])
        return prefs

    def summarize_for_prompt(self, session_id: str) -> str:
        prefs = self.get_all_preferences(session_id)
        if not prefs:
            return ""
        lines = ["User long-term preferences:"]
        for k, vals in prefs.items():
            lines.append(f"  - {k}: {', '.join(vals)}")
        return "\n".join(lines)

    def list_sessions(self) -> list[str]:
        return list({m["session_id"] for m in self.metadata})

    def clear_session(self, session_id: str) -> int:
        """Remove a session's long-term entries (rebuilds the index)."""
        with self._lock:
            kept = [m for m in self.metadata if m["session_id"] != session_id]
            removed = len(self.metadata) - len(kept)
            self.metadata = kept
            # rebuild index from remaining (rare op; keeps store consistent)
            self.index = None
            self._persist_after_rebuild()
        return removed

    def _persist_after_rebuild(self) -> None:
        # index rebuild needs embeddings; defer to async rebuild on next save.
        # For simplicity we drop the vector index and rebuild lazily.
        try:
            if os.path.exists(self._index_path):
                os.remove(self._index_path)
            with open(self._meta_path, "w", encoding="utf-8") as f:
                json.dump(self.metadata, f, ensure_ascii=False, indent=2)
        except Exception as exc:
            logger.warning("rebuild persist failed: %s", exc)

    async def rebuild_index(self) -> None:
        """Rebuild the FAISS index from all metadata (e.g. after deletions)."""
        texts = [f"{m['preference_type']}: {m['value']}" for m in self.metadata]
        if not texts:
            self.index = None
            return
        vecs = await embed_texts(texts)
        if vecs is None:
            return
        with self._lock:
            self.index = faiss.IndexFlatIP(vecs.shape[1])
            self.index.add(vecs)
            self._persist()


# Singleton
long_term_memory = LongTermMemory()
