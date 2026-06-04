"""
City geocoding.

Primary  : Open-Meteo's free, keyless geocoding API (great for Latin names).
Problem  : Open-Meteo does NOT match CJK city names (e.g. "上海", "东京"), and the
           web UI normalises destinations to Chinese. So we:
             1. map well-known Chinese city names to their English form, then
             2. fall back to Nominatim (OpenStreetMap), which handles arbitrary
                CJK / non-Latin names, keyless (a descriptive User-Agent only).

Returns latitude/longitude/country for a city name. Cached in-process since
city coordinates never change within a session.
"""
from __future__ import annotations

from typing import Optional

from config import settings
from services.http_client import request_json

_GEO_URL = "https://geocoding-api.open-meteo.com/v1/search"
_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_cache: dict[str, Optional[dict]] = {}

# Common Chinese (and a few EN) city names -> English query Open-Meteo understands.
# Mirrors the destinations the web UI normalises to Chinese.
_CN_ALIAS = {
    "上海": "Shanghai", "北京": "Beijing", "东京": "Tokyo", "巴黎": "Paris",
    "纽约": "New York", "伦敦": "London", "香港": "Hong Kong", "首尔": "Seoul",
    "新加坡": "Singapore", "曼谷": "Bangkok", "迪拜": "Dubai", "悉尼": "Sydney",
    "罗马": "Rome", "巴塞罗那": "Barcelona", "大阪": "Osaka", "京都": "Kyoto",
    "尼斯": "Nice", "洛杉矶": "Los Angeles", "花桥": "Huaqiao", "广州": "Guangzhou",
    "深圳": "Shenzhen", "成都": "Chengdu", "杭州": "Hangzhou", "西安": "Xi'an",
    "南京": "Nanjing", "重庆": "Chongqing", "武汉": "Wuhan", "苏州": "Suzhou",
    "台北": "Taipei", "澳门": "Macau", "吉隆坡": "Kuala Lumpur", "首都": "",
}


def _from_open_meteo(r: dict) -> dict:
    return {
        "name": r.get("name"),
        "country": r.get("country"),
        "country_code": r.get("country_code"),
        "latitude": r.get("latitude"),
        "longitude": r.get("longitude"),
        "timezone": r.get("timezone", "auto"),
    }


async def _open_meteo(name: str, language: str) -> Optional[dict]:
    data = await request_json(
        "GET",
        _GEO_URL,
        params={"name": name, "count": 1, "language": language, "format": "json"},
    )
    if data and data.get("results"):
        return _from_open_meteo(data["results"][0])
    return None


async def _nominatim(name: str, language: str) -> Optional[dict]:
    data = await request_json(
        "GET",
        _NOMINATIM_URL,
        params={"q": name, "format": "json", "limit": 1, "addressdetails": 1,
                "accept-language": "zh" if language == "zh" else "en"},
        headers={"User-Agent": settings.USER_AGENT},
    )
    if isinstance(data, list) and data:
        r = data[0]
        addr = r.get("address", {}) or {}
        display = (addr.get("city") or addr.get("town") or addr.get("state")
                   or (r.get("display_name", "").split(",")[0]) or name)
        try:
            lat = float(r["lat"]); lon = float(r["lon"])
        except (KeyError, TypeError, ValueError):
            return None
        return {
            "name": display,
            "country": addr.get("country"),
            "country_code": (addr.get("country_code") or "").upper(),
            "latitude": lat,
            "longitude": lon,
            "timezone": "auto",
        }
    return None


async def geocode_city(name: str, language: str = "en") -> Optional[dict]:
    """Resolve a city name to {name, country, country_code, latitude, longitude, timezone}."""
    if not name:
        return None
    key = name.strip().lower()
    if key in _cache:
        return _cache[key]

    candidate = name.strip()
    # 1) Open-Meteo on the raw name (best for Latin names).
    result = await _open_meteo(candidate, language)
    # 2) Known Chinese name -> English alias, retry Open-Meteo.
    if result is None:
        alias = _CN_ALIAS.get(candidate)
        if alias:
            result = await _open_meteo(alias, "en")
    # 3) Nominatim handles arbitrary CJK / non-Latin names.
    if result is None:
        result = await _nominatim(candidate, language)

    _cache[key] = result
    return result
