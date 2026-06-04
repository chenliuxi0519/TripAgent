"""
Real attractions / points-of-interest.

Primary source : OpenTripMap (https://opentripmap.io) — free key, global POI DB.
Fallback       : Wikipedia GeoSearch (keyless) — nearby notable places.

No mock data: if both sources fail we return an explicit, empty result with a
message rather than fabricated venues.
"""
from __future__ import annotations

import asyncio
from typing import Optional

from config import settings
from services.geocode import geocode_city
from services.http_client import request_json

_OTM_BASE = "https://api.opentripmap.com/0.1/en/places"

# user category -> OpenTripMap "kinds"
_KIND_MAP = {
    "all": "interesting_places",
    "sightseeing": "interesting_places,view_points,architecture",
    "food": "foods,restaurants,cafes",
    "nature": "natural,gardens_and_parks,beaches",
    "culture": "museums,theatres_and_entertainments,religion,historic",
    "shopping": "shops,malls,marketplaces",
    "nightlife": "nightclubs,bars,pubs",
}


async def _otm_details(xid: str) -> Optional[dict]:
    data = await request_json(
        "GET",
        f"{_OTM_BASE}/xid/{xid}",
        params={"apikey": settings.OPENTRIPMAP_API_KEY},
    )
    return data


async def _via_opentripmap(
    lat: float, lon: float, category: str, limit: int
) -> list[dict]:
    kinds = _KIND_MAP.get(category, _KIND_MAP["all"])
    listing = await request_json(
        "GET",
        f"{_OTM_BASE}/radius",
        params={
            "radius": 15000,
            "lon": lon,
            "lat": lat,
            "kinds": kinds,
            "rate": "2",          # only rated/notable places
            "format": "json",
            "limit": limit * 2,
            "apikey": settings.OPENTRIPMAP_API_KEY,
        },
    )
    if not listing:
        return []

    # Keep named places, fetch details for the top ones (concurrently)
    named = [p for p in listing if p.get("name")][:limit]
    detail_tasks = [_otm_details(p["xid"]) for p in named if p.get("xid")]
    details = await asyncio.gather(*detail_tasks, return_exceptions=True)

    results = []
    for base, det in zip(named, details):
        item = {
            "name": base.get("name"),
            "category": (base.get("kinds", "").split(",")[0] or "place").replace("_", " "),
            "source": "OpenTripMap",
        }
        if isinstance(det, dict) and det:
            info = det.get("info") or {}
            addr = det.get("address") or {}
            item["description"] = (info.get("descr") or "")[:400] or None
            item["wikipedia"] = det.get("wikipedia") or None
            item["image"] = det.get("preview", {}).get("source") if det.get("preview") else None
            item["rating"] = det.get("rate")
            item["address"] = ", ".join(
                v for v in [addr.get("road"), addr.get("city"), addr.get("country")] if v
            ) or None
            if det.get("point"):
                item["lat"] = det["point"].get("lat")
                item["lon"] = det["point"].get("lon")
        results.append(item)
    return results


async def _via_wikipedia(lat: float, lon: float, limit: int, language: str) -> list[dict]:
    wiki_lang = "zh" if language == "zh" else "en"
    data = await request_json(
        "GET",
        f"https://{wiki_lang}.wikipedia.org/w/api.php",
        params={
            "action": "query",
            "list": "geosearch",
            "gscoord": f"{lat}|{lon}",
            "gsradius": 10000,
            "gslimit": limit,
            "format": "json",
        },
    )
    results = []
    if data:
        for p in data.get("query", {}).get("geosearch", []):
            results.append({
                "name": p.get("title"),
                "category": "notable place",
                "source": "Wikipedia",
                "wikipedia": f"https://{wiki_lang}.wikipedia.org/?curid={p.get('pageid')}",
                "lat": p.get("lat"),
                "lon": p.get("lon"),
            })
    return results


async def search_attractions(
    city: str,
    category: str = "all",
    budget: str = "any",
    pet_friendly: bool = False,
    limit: int = 8,
) -> dict:
    geo = await geocode_city(city, "en")
    if not geo:
        return {"city": city, "total_found": 0, "attractions": [],
                "error": "city_not_found"}

    lat, lon = geo["latitude"], geo["longitude"]
    attractions: list[dict] = []
    if settings.OPENTRIPMAP_API_KEY:
        attractions = await _via_opentripmap(lat, lon, category, limit)
    if not attractions:
        attractions = await _via_wikipedia(lat, lon, limit, "en")

    note = None
    # budget / pet_friendly aren't reliably exposed by open POI sources — be honest.
    if budget != "any" or pet_friendly:
        note = ("Note: budget/pet-friendly filters for attractions are advisory; "
                "open POI data does not expose these reliably.")

    return {
        "city": geo["name"],
        "country": geo.get("country"),
        "total_found": len(attractions),
        "attractions": attractions,
        "filters_applied": {"category": category, "budget": budget,
                            "pet_friendly": pet_friendly},
        "note": note,
        "source": "OpenTripMap" if settings.OPENTRIPMAP_API_KEY else "Wikipedia",
    }
