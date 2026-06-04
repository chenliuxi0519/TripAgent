"""
Structured itinerary planner.

This is the spec-compliant, goal-driven planning path used by the rich web UI
(trip-agent-main). Unlike the free-text chat agent, it returns a STRUCTURED
itinerary (days -> activities with real coordinates) that the frontend renders
directly as cards + a Leaflet map.

Per request it:
  1. PLAN     — decompose the goal into ordered sub-tasks (planning/planner.py).
  2. GATHER   — call real, free-API tools in parallel:
                  * geocode + weather      (Open-Meteo, keyless)
                  * real attractions+coords (OpenTripMap / Wikipedia geosearch)
                  * multi-hop RAG          (Wikivoyage + Wikipedia + FAISS)
  3. SYNTHESISE — one LLM call turns the gathered facts into a day-by-day
                  itinerary as strict JSON, grounded in the REAL attractions.
  4. GROUND   — post-process so every activity has sensible coordinates (real
                attraction coords win; otherwise geocode / city-centre fallback).
  5. REMEMBER — persist stated preferences to long-term (FAISS) memory.

Everything degrades gracefully: a flaky upstream never crashes the request, and
if the LLM JSON is unusable we fall back to an itinerary built directly from the
real attractions so the user always gets a usable, coordinate-rich plan.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Optional

from config import settings
from llm import chat_with_retry
from memory.memory_manager import long_term_memory
from planning.planner import make_plan, plan_to_prompt
from rag.retriever import research_destination
from services.geocode import geocode_city
from services.places import search_attractions
from services.weather import get_weather

logger = logging.getLogger("travelmind.trip_planner")

_ACTIVITY_TYPES = {"transportation", "attraction", "dining", "accommodation",
                   "shopping", "other"}

# rough cost tiers (local currency-agnostic, shown as ¥ in the UI) by budget
_COST_TIER = {
    "budget": {"dining": 60, "attraction": 30, "shopping": 100, "other": 40},
    "mid-range": {"dining": 150, "attraction": 80, "shopping": 300, "other": 100},
    "luxury": {"dining": 500, "attraction": 200, "shopping": 1000, "other": 300},
}


def _budget_tier(budget: Optional[dict]) -> str:
    """Map a {min,max,currency} budget (per whole trip) to a coarse tier."""
    if not budget:
        return "mid-range"
    try:
        hi = float(budget.get("max") or budget.get("min") or 0)
    except (TypeError, ValueError):
        return "mid-range"
    if hi <= 0:
        return "mid-range"
    if hi < 5000:
        return "budget"
    if hi > 15000:
        return "luxury"
    return "mid-range"


def _extract_json(raw: str) -> Optional[dict]:
    """Pull a JSON object out of an LLM reply (handles ```json fences / prose)."""
    if not raw:
        return None
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?", "", raw, flags=re.MULTILINE)
    raw = raw.replace("```", "").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
    return None


def _coords_ok(lat, lng, center: tuple[float, float], span: float = 3.0) -> bool:
    """True if (lat,lng) is a real number near the destination centre."""
    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return False
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return False
    return abs(lat - center[0]) <= span and abs(lng - center[1]) <= span


def _build_poi_index(attractions: list[dict]) -> list[tuple[str, float, float]]:
    idx = []
    for a in attractions:
        name = (a.get("name") or "").strip()
        lat, lon = a.get("lat"), a.get("lon")
        if name and lat is not None and lon is not None:
            idx.append((name.lower(), float(lat), float(lon)))
    return idx


def _match_poi(name: str, location_name: str,
               poi_index: list[tuple[str, float, float]]) -> Optional[tuple[float, float]]:
    targets = [t for t in (name, location_name) if t]
    for t in targets:
        tl = t.lower()
        for pname, lat, lon in poi_index:
            if pname and (pname in tl or tl in pname):
                return (lat, lon)
    return None


# ── Prompt ────────────────────────────────────────────────────────────────────

_SYS = {
    "zh": "你是专业旅行规划师，依据提供的【真实数据】生成结构化行程。只输出JSON，不要任何额外文字。",
    "en": "You are a professional travel planner. Build a structured itinerary "
          "strictly from the REAL DATA provided. Output ONLY JSON, no extra prose.",
}


def _user_prompt(language: str, city: str, country: str, days: int,
                 interests: list[str], budget_tier: str, constraints: list[str],
                 weather: dict, attractions: list[dict], rag: dict) -> str:
    # Compact the real attractions (name + coords + category) for grounding.
    poi_lines = []
    for a in attractions[:16]:
        if a.get("lat") is None or a.get("lon") is None:
            continue
        poi_lines.append(
            f"- {a.get('name')} | {a.get('category','place')} | "
            f"lat={a.get('lat')},lng={a.get('lon')}"
            + (f" | {a['description'][:80]}" if a.get("description") else "")
        )
    poi_block = "\n".join(poi_lines) or "(none)"

    rag_block = "\n".join(
        f"- {p.get('text','')[:240]}" for p in (rag.get("passages") or [])[:5]
    ) or "(none)"

    cur = (weather or {}).get("current", {})
    weather_line = (
        f"{cur.get('condition','')} {cur.get('temp_c','?')}°C; {weather.get('travel_tip','')}"
        if cur else "(unavailable)"
    )

    schema_zh = (
        '{"days":[{"dayNumber":1,"notes":"当日提示","activities":['
        '{"type":"attraction|dining|shopping|transportation|accommodation|other",'
        '"name":"名称","description":"一句话亮点","locationName":"地点名",'
        '"address":"地址","latitude":31.2304,"longitude":121.4737,'
        '"startTime":"09:00","endTime":"11:00","duration":120,"cost":0}]}]}'
    )

    if language == "zh":
        return (
            f"为【{city}{('，'+country) if country else ''}】规划 {days} 天行程。\n\n"
            f"【真实景点数据】(必须优先从中选择，并使用其经纬度)：\n{poi_block}\n\n"
            f"【目的地资料(多跳RAG)】：\n{rag_block}\n\n"
            f"【天气】：{weather_line}\n\n"
            f"【用户兴趣】：{('、'.join(interests)) or '观光、美食、文化'}\n"
            f"【预算档位】：{budget_tier}\n"
            f"【特殊需求】：{('、'.join(constraints)) or '无'}\n\n"
            "要求：\n"
            "1. 每天安排 3-5 个活动，覆盖上午/中午/下午/晚上，含至少一处用餐(dining)。\n"
            "2. 景点优先使用上面【真实景点数据】里的名称与经纬度；新增的餐厅等地点也要给出该城市内合理的真实经纬度(小数点后4位)，不同地点坐标不同。\n"
            "3. 时间用24小时制 HH:mm，duration 为分钟，cost 为人民币估算(按预算档位)。\n"
            "4. 结合天气与用户兴趣/特殊需求做合理安排。\n"
            f"5. 严格输出如下JSON结构(不要markdown)：\n{schema_zh}"
        )
    return (
        f"Plan a {days}-day trip to {city}{(', '+country) if country else ''}.\n\n"
        f"REAL ATTRACTIONS (prefer these; reuse their coordinates):\n{poi_block}\n\n"
        f"DESTINATION RESEARCH (multi-hop RAG):\n{rag_block}\n\n"
        f"WEATHER: {weather_line}\n\n"
        f"USER INTERESTS: {(', '.join(interests)) or 'sightseeing, food, culture'}\n"
        f"BUDGET TIER: {budget_tier}\n"
        f"SPECIAL NEEDS: {(', '.join(constraints)) or 'none'}\n\n"
        "Requirements:\n"
        "1. 3-5 activities/day across morning/noon/afternoon/evening, including at least one dining stop.\n"
        "2. Prefer the REAL ATTRACTIONS above and reuse their coordinates; for added places (e.g. restaurants) give plausible real coordinates within the city (4 decimals), distinct per place.\n"
        "3. 24h time HH:mm, duration in minutes, cost as an estimate matching the budget tier.\n"
        "4. Account for the weather and the user's interests/needs.\n"
        f"5. Output STRICTLY this JSON (no markdown):\n{schema_zh}"
    )


# ── Fallback itinerary (no/failed LLM) built from real attractions ────────────

def _fallback_itinerary(days: int, attractions: list[dict],
                        center: tuple[float, float], budget_tier: str,
                        language: str) -> list[dict]:
    pois = [a for a in attractions if a.get("lat") is not None and a.get("lon") is not None]
    costs = _COST_TIER.get(budget_tier, _COST_TIER["mid-range"])
    slots = [("09:00", "11:30", 150), ("12:00", "13:30", 90),
             ("14:00", "16:30", 150), ("18:00", "19:30", 90)]
    out = []
    pi = 0
    for d in range(1, days + 1):
        acts = []
        for si, (s, e, dur) in enumerate(slots):
            is_meal = si in (1, 3)
            if is_meal:
                lat = center[0] + (0.01 * (d + si))
                lng = center[1] + (0.01 * (d - si))
                acts.append({
                    "type": "dining",
                    "name": ("当地餐厅" if language == "zh" else "Local restaurant"),
                    "description": ("品尝本地特色" if language == "zh" else "Taste local specialties"),
                    "locationName": ("市中心餐厅" if language == "zh" else "City-centre eatery"),
                    "address": "", "latitude": round(lat, 4), "longitude": round(lng, 4),
                    "startTime": s, "endTime": e, "duration": dur, "cost": costs["dining"],
                })
                continue
            if pi < len(pois):
                a = pois[pi]; pi += 1
                acts.append({
                    "type": "attraction",
                    "name": a.get("name"),
                    "description": (a.get("description") or "")[:120],
                    "locationName": a.get("name"),
                    "address": a.get("address") or "",
                    "latitude": round(float(a["lat"]), 4),
                    "longitude": round(float(a["lon"]), 4),
                    "startTime": s, "endTime": e, "duration": dur, "cost": costs["attraction"],
                })
        out.append({
            "dayNumber": d,
            "notes": ("依据真实景点与天气生成的备选行程" if language == "zh"
                      else "Backup plan generated from real attractions & weather"),
            "activities": acts,
        })
    return out


# ── Public entry point ────────────────────────────────────────────────────────

async def plan_trip(
    session_id: str,
    destination: str,
    days: int = 2,
    language: str = "zh",
    interests: Optional[list[str]] = None,
    budget: Optional[dict] = None,
    constraints: Optional[list[str]] = None,
    start_date: Optional[str] = None,
) -> dict:
    interests = interests or []
    constraints = constraints or []
    days = max(1, min(int(days or 2), 14))

    geo = await geocode_city(destination, "en")
    if not geo:
        return {
            "error": "city_not_found",
            "message": (f"找不到城市“{destination}”。" if language == "zh"
                        else f"Could not find city '{destination}'."),
            "destination": {"name": destination, "country": "", "coordinates": None},
            "days": [], "plan": {}, "tool_calls": [], "sources": [],
        }

    center = (float(geo["latitude"]), float(geo["longitude"]))
    country = geo.get("country") or ""
    city = geo.get("name") or destination

    # ── 1. PLAN ──────────────────────────────────────────────────────────────
    goal = (f"规划{city}{days}天行程" if language == "zh"
            else f"Plan a {days}-day trip to {city}")
    lt_summary = long_term_memory.summarize_for_prompt(session_id)
    plan = await make_plan(goal, language, lt_summary)

    # ── 2. GATHER (parallel, defensive, time-budgeted) ───────────────────────
    # Weather + attractions are quick; the multi-hop RAG (crawl + embed) is the
    # long pole, so it gets its own timeout. If it exceeds the budget we proceed
    # with the real attractions + weather the LLM already has — never block the
    # user past a few seconds waiting on Wikipedia/embeddings.
    focus = " ".join(interests) if interests else ""

    async def _rag_budgeted():
        try:
            return await asyncio.wait_for(
                research_destination(city, focus=focus, language=language),
                timeout=settings.RAG_TIMEOUT,
            )
        except (asyncio.TimeoutError, Exception) as exc:  # noqa: BLE001
            logger.warning("RAG skipped (%s)", type(exc).__name__)
            return {"passages": [], "sources": [], "retrieval": "skipped (timeout)"}

    weather_r, attractions_r, rag_r = await asyncio.gather(
        get_weather(city, language),
        search_attractions(city, "all", limit=16),
        _rag_budgeted(),
        return_exceptions=True,
    )
    weather = weather_r if isinstance(weather_r, dict) else {}
    attractions = (attractions_r.get("attractions", [])
                   if isinstance(attractions_r, dict) else [])
    rag = rag_r if isinstance(rag_r, dict) else {"passages": [], "sources": []}

    tool_calls = [
        {"tool": "get_weather", "input": {"city": city},
         "result_summary": str(weather.get("current", weather))[:160]},
        {"tool": "search_attractions", "input": {"city": city},
         "result_summary": f"{len(attractions)} real POIs"},
        {"tool": "research_destination", "input": {"city": city, "focus": focus},
         "result_summary": f"{len(rag.get('passages', []))} passages / "
                           f"{len(rag.get('sources', []))} sources"},
    ]

    budget_tier = _budget_tier(budget)

    # ── 3. SYNTHESISE (LLM -> JSON) ──────────────────────────────────────────
    day_dicts: list[dict] = []
    used_llm = False
    if settings.llm_configured:
        try:
            resp = await asyncio.wait_for(
                chat_with_retry(
                    model=settings.LLM_MODEL,
                    messages=[
                        {"role": "system", "content": _SYS.get(language, _SYS["zh"])},
                        {"role": "user", "content": _user_prompt(
                            language, city, country, days, interests, budget_tier,
                            constraints, weather, attractions, rag)},
                    ],
                    # Output tokens dominate latency on the free tier; a 2-day
                    # plan fits comfortably in ~2k. One retry only.
                    max_tokens=2048,
                    temperature=0.6,
                    response_format={"type": "json_object"},
                    max_retries=1,
                ),
                # Hard cap: if the free-tier model is slow/throttled, stop waiting
                # and build the itinerary from the real attractions instead, so
                # the user always gets a usable, coordinate-rich plan promptly.
                timeout=settings.LLM_TIMEOUT,
            )
            parsed = _extract_json(resp.choices[0].message.content or "")
            if parsed and isinstance(parsed.get("days"), list) and parsed["days"]:
                day_dicts = parsed["days"]
                used_llm = True
        except asyncio.TimeoutError:
            logger.warning("trip_planner LLM synthesis timed out (%.0fs); using "
                           "real-attraction fallback", settings.LLM_TIMEOUT)
        except Exception as exc:  # noqa: BLE001 — never fail the request
            logger.warning("trip_planner LLM synthesis failed: %s", exc)

    if not day_dicts:
        day_dicts = _fallback_itinerary(days, attractions, center, budget_tier, language)

    # ── 4. GROUND coordinates ────────────────────────────────────────────────
    poi_index = _build_poi_index(attractions)
    costs = _COST_TIER.get(budget_tier, _COST_TIER["mid-range"])
    norm_days: list[dict] = []
    for di, day in enumerate(day_dicts[:days], start=1):
        acts_out = []
        raw_acts = day.get("activities") if isinstance(day, dict) else None
        for ai, act in enumerate(raw_acts or []):
            if not isinstance(act, dict):
                continue
            atype = (act.get("type") or "attraction").lower()
            if atype not in _ACTIVITY_TYPES:
                atype = "other"
            name = (act.get("name") or act.get("locationName") or "活动").strip()
            loc_name = (act.get("locationName") or name).strip()

            lat, lng = act.get("latitude"), act.get("longitude")
            if not _coords_ok(lat, lng, center):
                match = _match_poi(name, loc_name, poi_index)
                if match:
                    lat, lng = match
                else:
                    # deterministic offset around centre so points don't overlap
                    lat = round(center[0] + 0.012 * ((di + ai) % 5 - 2), 4)
                    lng = round(center[1] + 0.012 * ((di * 2 + ai) % 5 - 2), 4)
            else:
                lat, lng = round(float(lat), 4), round(float(lng), 4)

            try:
                cost = float(act.get("cost"))
            except (TypeError, ValueError):
                cost = float(costs.get(atype, costs["other"]))

            acts_out.append({
                "type": atype,
                "name": name,
                "description": act.get("description") or "",
                "locationName": loc_name,
                "address": act.get("address") or "",
                "latitude": lat,
                "longitude": lng,
                "startTime": act.get("startTime") or "09:00",
                "endTime": act.get("endTime") or "17:00",
                "duration": int(act.get("duration") or 120),
                "cost": round(cost),
            })
        if acts_out:
            norm_days.append({
                "dayNumber": di,
                "notes": (day.get("notes") if isinstance(day, dict) else "") or "",
                "activities": acts_out,
            })

    if not norm_days:  # absolute last resort
        norm_days = _fallback_itinerary(days, attractions, center, budget_tier, language)

    # ── 5. REMEMBER preferences ──────────────────────────────────────────────
    try:
        if interests:
            await long_term_memory.save(session_id, "interests", ", ".join(interests))
        if budget:
            await long_term_memory.save(session_id, "budget", budget_tier)
        for c in constraints:
            await long_term_memory.save(session_id, "constraints", c)
    except Exception as exc:  # noqa: BLE001
        logger.warning("persisting preferences failed: %s", exc)

    return {
        "destination": {
            "name": city,
            "country": country,
            "coordinates": {"lat": center[0], "lng": center[1]},
        },
        "days": norm_days,
        "weather": weather,
        "plan": plan,
        "plan_text": plan_to_prompt(plan, language).strip(),
        "tool_calls": tool_calls,
        "sources": rag.get("sources", []),
        "retrieval": rag.get("retrieval"),
        "used_llm": used_llm,
        "budget_tier": budget_tier,
        "language": language,
        "session_id": session_id,
        "long_term_prefs": long_term_memory.get_all_preferences(session_id),
    }
