"""
Planning mechanism (Plan-and-Execute style).

Before the agent calls any tool, the planner decomposes the user's goal into an
ordered list of sub-tasks, each tagged with the tool the agent should use. The
plan is (a) injected into the system prompt so execution follows it, and
(b) returned to the UI so the user can see the agent's reasoning.

Two modes:
  * deterministic (default) — custom rule-based logic, zero extra LLM calls.
    Detects intent + destination + budget/constraints by parsing the message,
    then builds the appropriate plan. Conserves the free-tier quota.
  * LLM (settings.PLANNER_USE_LLM) — an extra model call produces a bespoke,
    context-aware plan, with the deterministic plan as fallback.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

from config import settings
from llm import chat_with_retry

logger = logging.getLogger("travelmind.planner")


# ── Lightweight intent / slot detection (no LLM) ──────────────────────────────

_TRIP_HINTS = re.compile(
    r"\b(plan|trip|itinerary|visit|travel|tour|day[s]?|holiday|vacation)\b|"
    r"规划|行程|旅行|旅游|游玩|出行|度假|几日|两日|2日|二日",
    re.IGNORECASE,
)
_ORIGIN_HINT = re.compile(
    r"\bfrom\s+([A-Z][a-zA-Z一-鿿]+)|从\s*([一-鿿A-Za-z]+)\s*(?:出发|飞|去)",
)


def detect_intent(message: str) -> str:
    if _TRIP_HINTS.search(message):
        return "trip_planning"
    if len(message.strip()) < 12 and not re.search(r"[?？]", message):
        return "chitchat"
    return "question"


def _has_origin(message: str) -> bool:
    return bool(_ORIGIN_HINT.search(message))


def _deterministic_plan(message: str, language: str) -> dict:
    intent = detect_intent(message)
    zh = language == "zh"

    if intent != "trip_planning":
        steps = (
            [{"step": "理解用户问题并按需检索资料", "tool": "research_destination"},
             {"step": "必要时联网搜索补充信息", "tool": "web_search"},
             {"step": "组织并给出回答", "tool": "none"}]
            if zh else
            [{"step": "Understand the question and retrieve context if needed",
              "tool": "research_destination"},
             {"step": "Search the web for extra info if needed", "tool": "web_search"},
             {"step": "Compose the answer", "tool": "none"}]
        )
        return {"intent": intent, "destination": None, "steps": steps,
                "source": "deterministic"}

    steps = (
        [{"step": "查询目的地天气与未来预报", "tool": "get_weather"},
         {"step": "多跳检索目的地深度资料与亮点 (RAG)", "tool": "research_destination"},
         {"step": "搜索景点、餐厅与活动", "tool": "search_attractions"},
         {"step": "推荐符合预算的酒店", "tool": "search_hotels"}]
        if zh else
        [{"step": "Check destination weather & forecast", "tool": "get_weather"},
         {"step": "Multi-hop research of destination highlights (RAG)",
          "tool": "research_destination"},
         {"step": "Search attractions, restaurants & activities", "tool": "search_attractions"},
         {"step": "Recommend hotels matching budget", "tool": "search_hotels"}]
    )
    if _has_origin(message):
        steps.append({"step": "搜索往返航班" if zh else "Search flights",
                      "tool": "search_flights"})
    steps.append({"step": "整合为详细的2日行程" if zh else "Assemble a detailed 2-day itinerary",
                  "tool": "none"})
    return {"intent": intent, "destination": None, "steps": steps,
            "source": "deterministic"}


# ── Optional LLM planner ──────────────────────────────────────────────────────

_PLANNER_SYSTEM = {
    "zh": ("你是旅行规划任务分解器。把用户目标拆成有序子任务。只输出JSON："
           "{\"intent\":\"trip_planning|question|chitchat\",\"destination\":\"城市或null\","
           "\"steps\":[{\"step\":\"简述\",\"tool\":\"get_weather|search_attractions|"
           "research_destination|search_flights|search_hotels|web_search|none\"}]}。不要多余文字。"),
    "en": ("You are a travel planning task decomposer. Break the goal into ordered "
           "sub-tasks. Output ONLY JSON: {\"intent\":\"trip_planning|question|chitchat\","
           "\"destination\":\"city or null\",\"steps\":[{\"step\":\"short\",\"tool\":"
           "\"get_weather|search_attractions|research_destination|search_flights|"
           "search_hotels|web_search|none\"}]}. No extra prose."),
}


def _parse_json(raw: str) -> Optional[dict]:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None


async def make_plan(
    user_message: str,
    language: str,
    long_term_context: str = "",
) -> dict:
    """Return a structured plan for the user's message."""
    deterministic = _deterministic_plan(user_message, language)
    if not settings.PLANNER_USE_LLM:
        return deterministic

    sys = _PLANNER_SYSTEM.get(language, _PLANNER_SYSTEM["en"])
    user = user_message
    if long_term_context:
        user = f"{user_message}\n\n[known preferences]\n{long_term_context}"
    try:
        resp = await chat_with_retry(
            model=settings.LLM_MODEL,
            messages=[{"role": "system", "content": sys},
                      {"role": "user", "content": user}],
            max_tokens=900,
            temperature=0.2,
            response_format={"type": "json_object"},
            max_retries=1,
        )
        plan = _parse_json(resp.choices[0].message.content or "")
        if not plan or not isinstance(plan.get("steps"), list) or not plan["steps"]:
            return deterministic
        plan["source"] = "llm"
        plan.setdefault("intent", deterministic["intent"])
        plan.setdefault("destination", None)
        return plan
    except Exception as exc:
        logger.warning("planner LLM failed, using deterministic: %s", exc)
        return deterministic


def plan_to_prompt(plan: dict, language: str) -> str:
    if not plan or not plan.get("steps"):
        return ""
    header = ("\n\n当前执行计划（请按此顺序使用工具，逐步完成；"
              "若某步信息已足够可跳过该工具）：\n" if language == "zh"
              else "\n\nCurrent execution plan (use tools in this order; skip a "
                   "tool only if its info is already sufficient):\n")
    lines = []
    for i, s in enumerate(plan["steps"], 1):
        tool = s.get("tool", "none")
        tool_part = f" → [{tool}]" if tool and tool != "none" else ""
        lines.append(f"{i}. {s.get('step', '')}{tool_part}")
    return header + "\n".join(lines)
