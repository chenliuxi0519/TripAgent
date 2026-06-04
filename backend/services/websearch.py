"""
Web search tool — keyless and free.

Primary : DuckDuckGo HTML endpoint (no API key).
Fallback: Wikipedia OpenSearch (always available).

Returns a small list of {title, snippet, url}. Used by the agent when it needs
fresh, open-web context (events, current info) beyond the structured tools.
"""
from __future__ import annotations

import html
import re
from urllib.parse import unquote

from services.http_client import get_client, request_json

_DDG_URL = "https://html.duckduckgo.com/html/"

_RESULT_RE = re.compile(
    r'<a[^>]*class="result__a"[^>]*href="(?P<url>[^"]+)"[^>]*>(?P<title>.*?)</a>'
    r'.*?(?:<a[^>]*class="result__snippet"[^>]*>(?P<snippet>.*?)</a>)?',
    re.DOTALL,
)
_TAG_RE = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    return html.unescape(_TAG_RE.sub("", text or "")).strip()


def _unwrap_ddg(url: str) -> str:
    # DDG wraps links like //duckduckgo.com/l/?uddg=<encoded>
    m = re.search(r"uddg=([^&]+)", url)
    if m:
        return unquote(m.group(1))
    if url.startswith("//"):
        return "https:" + url
    return url


async def _via_duckduckgo(query: str, limit: int) -> list[dict]:
    client = get_client()
    try:
        resp = await client.post(_DDG_URL, data={"q": query})
        resp.raise_for_status()
        body = resp.text
    except Exception:
        return []

    results = []
    for m in _RESULT_RE.finditer(body):
        title = _clean(m.group("title"))
        if not title:
            continue
        results.append({
            "title": title,
            "snippet": _clean(m.group("snippet") or ""),
            "url": _unwrap_ddg(m.group("url")),
        })
        if len(results) >= limit:
            break
    return results


async def _via_wikipedia(query: str, limit: int) -> list[dict]:
    data = await request_json(
        "GET",
        "https://en.wikipedia.org/w/api.php",
        params={
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srlimit": limit,
            "format": "json",
        },
    )
    results = []
    if data:
        for item in data.get("query", {}).get("search", []):
            title = item.get("title", "")
            results.append({
                "title": title,
                "snippet": _clean(item.get("snippet", "")),
                "url": f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
            })
    return results


async def web_search(query: str, limit: int = 5) -> dict:
    results = await _via_duckduckgo(query, limit)
    source = "DuckDuckGo"
    if not results:
        results = await _via_wikipedia(query, limit)
        source = "Wikipedia"
    return {
        "query": query,
        "results": results,
        "source": source,
        "count": len(results),
    }
