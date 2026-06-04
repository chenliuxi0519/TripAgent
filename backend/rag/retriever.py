"""
Multi-hop Retrieval-Augmented Generation over real, open knowledge sources.

Sources (all keyless): Wikivoyage travel guides + Wikipedia articles.

Pipeline
--------
Hop 1  Fetch the destination's Wikivoyage guide + Wikipedia summary
       (high-level "what is this city about").
Hop 2  Identify concrete attractions near the city (real POIs from the places
       service) and fetch each one's Wikipedia intro — the "second hop" that
       drills from the city into specific places.
Index  Chunk everything, embed with the configured provider, build a FAISS index.
Query  Retrieve the top-k chunks most relevant to the user's focus.

Per-city indices are cached in-process so repeated questions about the same
destination don't re-crawl. If embeddings are unavailable, we degrade to
returning the most relevant raw passages via keyword overlap.
"""
from __future__ import annotations

import asyncio
import logging
import re
from collections import OrderedDict
from typing import Optional

import faiss
import numpy as np

from embeddings import embed_text, embed_texts
from services.geocode import geocode_city
from services.http_client import request_json
from services.places import search_attractions

logger = logging.getLogger("travelmind.rag")

_MAX_CACHED_CITIES = 12
_cache: "OrderedDict[str, CityKnowledge]" = OrderedDict()


# ── Source fetching ──────────────────────────────────────────────────────────

async def _wiki_extract(site: str, title: str, lang: str, chars: int) -> Optional[str]:
    data = await request_json(
        "GET",
        f"https://{lang}.{site}.org/w/api.php",
        params={
            "action": "query",
            "prop": "extracts",
            "explaintext": 1,
            "exsectionformat": "plain",
            "redirects": 1,
            "exchars": chars,
            "titles": title,
            "format": "json",
        },
    )
    if not data:
        return None
    pages = data.get("query", {}).get("pages", {})
    for _, page in pages.items():
        if "extract" in page and page["extract"].strip():
            return page["extract"]
    return None


def _chunk(text: str, source: str, max_len: int = 600) -> list[dict]:
    """Split text into paragraph-aligned chunks tagged with their source."""
    chunks = []
    buf = ""
    for para in re.split(r"\n{2,}|\n", text):
        para = para.strip()
        if not para or para.startswith("==") or len(para) < 25:
            continue
        if len(buf) + len(para) + 1 > max_len:
            if buf:
                chunks.append({"text": buf.strip(), "source": source})
            buf = para
        else:
            buf = f"{buf} {para}".strip()
    if buf:
        chunks.append({"text": buf.strip(), "source": source})
    return chunks


# ── City knowledge (index built from multi-hop sources) ──────────────────────

class CityKnowledge:
    def __init__(self, city: str):
        self.city = city
        self.chunks: list[dict] = []
        self.index: Optional[faiss.Index] = None
        self.embedded = False
        self.sources: list[str] = []

    async def build(self, language: str = "en") -> None:
        wiki_lang = "zh" if language == "zh" else "en"
        geo = await geocode_city(self.city, "en")
        canonical = geo["name"] if geo else self.city

        # ── Hop 1: city-level guides (fetched concurrently) ────────────────
        voyage, summary = await asyncio.gather(
            _wiki_extract("wikivoyage", canonical, "en", 4000),
            _wiki_extract("wikipedia", canonical, wiki_lang, 2500),
        )
        if voyage:
            self.chunks += _chunk(voyage, f"Wikivoyage: {canonical}")
            self.sources.append(f"Wikivoyage - {canonical}")
        if summary:
            self.chunks += _chunk(summary, f"Wikipedia: {canonical}")
            self.sources.append(f"Wikipedia - {canonical}")

        # ── Hop 2: drill into specific attractions (all fetched in parallel) ─
        try:
            poi = await search_attractions(canonical, "all", limit=4)
            names = [a["name"] for a in poi.get("attractions", []) if a.get("name")][:4]
        except Exception:
            names = []
        extracts = await asyncio.gather(
            *[_wiki_extract("wikipedia", n, wiki_lang, 1000) for n in names],
            return_exceptions=True,
        )
        for name, extract in zip(names, extracts):
            if isinstance(extract, str) and extract:
                self.chunks += _chunk(extract, f"Wikipedia: {name}")
                self.sources.append(f"Wikipedia - {name}")

        # ── Build vector index ────────────────────────────────────────────
        await self._embed()

    async def _embed(self) -> None:
        if not self.chunks:
            return
        texts = [c["text"] for c in self.chunks]
        vecs = await embed_texts(texts)
        if vecs is None or len(vecs) == 0:
            self.embedded = False
            return
        index = faiss.IndexFlatIP(vecs.shape[1])
        index.add(vecs)
        self.index = index
        self.embedded = True

    async def query(self, question: str, top_k: int = 5) -> list[dict]:
        if not self.chunks:
            return []
        if self.embedded and self.index is not None:
            qv = await embed_text(question)
            if qv is not None:
                scores, idx = self.index.search(np.array([qv]), min(top_k, len(self.chunks)))
                out = []
                for rank, i in enumerate(idx[0]):
                    if 0 <= i < len(self.chunks):
                        c = self.chunks[i]
                        out.append({"text": c["text"], "source": c["source"],
                                    "score": float(scores[0][rank])})
                return out
        # keyword-overlap fallback
        terms = {w for w in re.findall(r"\w+", question.lower()) if len(w) > 2}
        scored = []
        for c in self.chunks:
            overlap = len(terms & set(re.findall(r"\w+", c["text"].lower())))
            scored.append((overlap, c))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [{"text": c["text"], "source": c["source"], "score": float(s)}
                for s, c in scored[:top_k]]


async def _get_city_knowledge(city: str, language: str) -> CityKnowledge:
    key = city.strip().lower()
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    ck = CityKnowledge(city)
    await ck.build(language)
    _cache[key] = ck
    _cache.move_to_end(key)
    while len(_cache) > _MAX_CACHED_CITIES:
        _cache.popitem(last=False)
    return ck


# ── Public tool entry point ───────────────────────────────────────────────────

async def research_destination(
    city: str, focus: str = "", language: str = "zh", top_k: int = 5
) -> dict:
    """Multi-hop RAG: return relevant passages about a destination + focus."""
    ck = await _get_city_knowledge(city, language)
    if not ck.chunks:
        return {
            "city": city, "passages": [], "sources": [],
            "error": "no_knowledge_found",
            "message": (f"未能检索到关于“{city}”的资料。" if language == "zh"
                        else f"No reference material found for '{city}'."),
        }
    question = f"{city} {focus}".strip() or city
    passages = await ck.query(question, top_k=top_k)
    return {
        "city": city,
        "focus": focus,
        "passages": passages,
        "sources": list(dict.fromkeys(ck.sources)),
        "retrieval": "vector (FAISS + embeddings)" if ck.embedded
                     else "keyword-overlap (embeddings unavailable)",
        "hops": ["city guide (Wikivoyage/Wikipedia)", "attraction detail pages (Wikipedia)"],
    }
