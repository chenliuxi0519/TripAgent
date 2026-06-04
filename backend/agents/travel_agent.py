"""
Travel Planning Agent.

Reasoning engine : any OpenAI-compatible LLM (default Zhipu GLM-4-Flash, free).
Flow per turn:
  1. Pull long-term preferences (semantic recall) into context.
  2. PLAN  — decompose the goal into ordered sub-tasks (planning/planner.py).
  3. EXECUTE — a tool-calling loop where the model decides which real-API tool
     to call, guided by the plan. Includes multi-hop RAG via research_destination.
  4. Persist any stated preferences to long-term memory.

Most tool data is real (Open-Meteo, OpenTripMap/Wikipedia, Wikivoyage,
DuckDuckGo); flights/hotels are simulated (services/mock_travel.py). The loop is
defensive so a flaky upstream API never crashes a turn.
"""
from __future__ import annotations

import json
import logging

from config import settings
from llm import chat_with_retry
from memory.memory_manager import (
    get_conversation, add_message, long_term_memory,
)
from planning.planner import make_plan, plan_to_prompt
from tools.travel_tools import TOOL_SCHEMAS, execute_tool

logger = logging.getLogger("travelmind.agent")


def _convert_tools(anthropic_tools: list) -> list:
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in anthropic_tools
    ]


OPENAI_TOOLS = _convert_tools(TOOL_SCHEMAS)

SYSTEM_PROMPTS = {
    "zh": """你是一位专业、热情的AI旅行规划师，名叫"旅小智"。你帮助用户规划个性化的2日旅行行程。

你拥有以下工具：
1. get_weather — 实时天气与未来预报（Open-Meteo，真实）
2. research_destination — 多跳检索目的地深度资料（Wikivoyage + 维基百科，真实）
3. search_attractions — 真实景点/餐厅/活动（OpenTripMap / 维基百科）
4. search_flights — 航班选项（模拟数据，价格为基于距离的估算）
5. search_hotels — 酒店选项（模拟数据，价格按档位估算）
6. web_search — 开放网络搜索（DuckDuckGo，真实）
7. save_user_preference — 保存用户长期偏好

工作原则：
- 严格按照下方"执行计划"的步骤，依次调用相应工具收集信息。
- 规划行程时优先调用 research_destination 获取准确的景点描述与本地建议（多跳RAG）。
- 根据用户预算（经济/中档/豪华）和特殊需求（携宠物、素食、无障碍等）筛选。
- 给出详细的2日行程，包含每天早/中/晚的具体安排、用时与小贴士。
- 天气、景点、资料为真实数据；航班和酒店为模拟数据，展示时请注明"模拟/估算，预订前请核实"，不要把估算价格说成实时报价。
- 如果某个工具返回 error（如找不到城市），如实告知用户该项暂不可用，绝不凭空编造真实数据。
- 主动澄清模糊需求（如缺少出发城市或日期时询问）。
- 当用户表达偏好时调用 save_user_preference 记住它。
- 高效使用工具：每个工具针对同一目标最多调用一次，不要重复调用已经得到结果的工具；收集到足够信息后立即给出最终行程。
- 用友好、专业的中文回复，适当使用emoji。

{long_term_prefs}
{plan}
""",
    "en": """You are an enthusiastic, professional AI travel planner named "TravelMind". You help users plan personalized 2-day trips.

Your tools:
1. get_weather — live weather & forecast (Open-Meteo, real)
2. research_destination — multi-hop retrieval of destination knowledge (Wikivoyage + Wikipedia, real)
3. search_attractions — real attractions/restaurants/activities (OpenTripMap / Wikipedia)
4. search_flights — flight options (SIMULATED; prices are distance-based estimates)
5. search_hotels — hotel options (SIMULATED; realistic prices by budget tier)
6. web_search — open web search (DuckDuckGo, real)
7. save_user_preference — store durable user preferences

Operating principles:
- Follow the "Execution plan" below, calling the matching tool at each step.
- When building an itinerary, prefer research_destination for accurate descriptions and local tips (multi-hop RAG).
- Filter by the user's budget (budget/mid-range/luxury) and special needs (pet-friendly, dietary, accessibility).
- Produce a detailed 2-day itinerary with concrete morning/afternoon/evening plans, timing and tips.
- Weather, attractions and research are REAL; flights and hotels are SIMULATED — when presenting them, note they are "simulated/estimated, verify before booking" and never call the estimated prices live quotes.
- If a tool returns an error (e.g. city not found), tell the user that item is unavailable — never invent real data.
- Proactively clarify ambiguous requests (ask for origin city or dates when missing).
- When the user states a preference, call save_user_preference to remember it.
- Be tool-efficient: call each tool at most once per goal, never repeat a tool you already have results for, and produce the final itinerary as soon as you have enough information.
- Reply in friendly, professional English with appropriate emojis.

{long_term_prefs}
{plan}
""",
}


def _history_to_openai(history: list) -> list:
    result = []
    for msg in history:
        role = msg["role"]
        content = msg["content"]
        if role == "user":
            if isinstance(content, list):
                for item in content:
                    if item.get("type") == "tool_result":
                        result.append({
                            "role": "tool",
                            "tool_call_id": item["tool_use_id"],
                            "content": item["content"],
                        })
            else:
                result.append({"role": "user", "content": content})
        elif role == "assistant":
            if isinstance(content, list):
                text_parts = [b["text"] for b in content if b.get("type") == "text"]
                tool_calls = []
                for b in content:
                    if b.get("type") == "tool_use":
                        tool_calls.append({
                            "id": b["id"],
                            "type": "function",
                            "function": {
                                "name": b["name"],
                                "arguments": json.dumps(b["input"], ensure_ascii=False),
                            },
                        })
                msg_obj = {"role": "assistant", "content": " ".join(text_parts) or None}
                if tool_calls:
                    msg_obj["tool_calls"] = tool_calls
                result.append(msg_obj)
            else:
                result.append({"role": "assistant", "content": content})
    return result


async def run_agent(
    session_id: str,
    user_message: str,
    language: str = "zh",
) -> dict:
    if not settings.llm_configured:
        return {
            "response": ("⚠️ 后端未配置 LLM_API_KEY，无法调用模型。"
                         if language == "zh"
                         else "⚠️ Backend is missing LLM_API_KEY; the model cannot run."),
            "tool_calls": [], "plan": {}, "session_id": session_id,
            "language": language, "long_term_prefs": {},
        }

    lt_summary = long_term_memory.summarize_for_prompt(session_id)

    # ── 1. PLAN ────────────────────────────────────────────────────────────
    plan = await make_plan(user_message, language, lt_summary)
    plan_fragment = plan_to_prompt(plan, language)

    system_prompt = SYSTEM_PROMPTS.get(language, SYSTEM_PROMPTS["zh"]).format(
        long_term_prefs=lt_summary,
        plan=plan_fragment,
    )

    add_message(session_id, "user", user_message)

    tool_calls_log = []
    tool_cache: dict[str, object] = {}  # dedupe identical tool calls within a turn
    max_iterations = settings.MAX_TOOL_ITERATIONS

    # ── 2/3. EXECUTE (tool-calling loop) ─────────────────────────────────────
    for iteration in range(max_iterations):
        history = get_conversation(session_id)
        messages = [{"role": "system", "content": system_prompt}] + _history_to_openai(history)

        # On the last allowed iteration, drop tools so the model MUST synthesise a
        # final answer from what it has gathered (guarantees a usable reply
        # instead of an endless tool-calling loop / timeout).
        is_last = iteration == max_iterations - 1
        if is_last:
            messages.append({
                "role": "system",
                "content": ("现在请基于已获取的信息，直接输出完整的最终行程，不要再调用工具。"
                            if language == "zh"
                            else "Now produce the complete final itinerary from the "
                                 "information gathered. Do NOT call any more tools."),
            })

        llm_kwargs = {
            "model": settings.LLM_MODEL,
            "messages": messages,
            "max_tokens": 4096,
            "temperature": 0.5,
        }
        if not is_last:
            llm_kwargs["tools"] = OPENAI_TOOLS
            llm_kwargs["tool_choice"] = "auto"

        try:
            response = await chat_with_retry(**llm_kwargs)
        except Exception as exc:
            logger.error("LLM call failed: %s", exc)
            return {
                "response": ("抱歉，模型调用出错，请稍后重试。"
                             if language == "zh"
                             else "Sorry, the model call failed. Please retry."),
                "tool_calls": tool_calls_log, "plan": plan,
                "session_id": session_id, "language": language,
                "long_term_prefs": long_term_memory.get_all_preferences(session_id),
            }

        choice = response.choices[0]
        msg = choice.message

        if choice.finish_reason == "tool_calls" and msg.tool_calls:
            serialized = [{"type": "text", "text": msg.content or ""}]
            for tc in msg.tool_calls:
                try:
                    parsed = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    parsed = {}
                serialized.append({
                    "type": "tool_use", "id": tc.id,
                    "name": tc.function.name, "input": parsed,
                })
            add_message(session_id, "assistant", serialized)

            tool_results = []
            for tc in msg.tool_calls:
                try:
                    tool_input = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    tool_input = {}

                if tc.function.name == "save_user_preference":
                    tool_input["session_id"] = session_id
                    await long_term_memory.save(
                        session_id=session_id,
                        preference_type=tool_input.get("preference_type", "general"),
                        value=tool_input.get("value", ""),
                    )

                # Dedupe: if this exact tool+args ran already this turn, reuse the
                # result instead of hitting the upstream API again.
                cache_key = f"{tc.function.name}:{json.dumps(tool_input, sort_keys=True, ensure_ascii=False)}"
                if cache_key in tool_cache:
                    result = tool_cache[cache_key]
                else:
                    result = await execute_tool(tc.function.name, tool_input)
                    tool_cache[cache_key] = result
                tool_calls_log.append({
                    "tool": tc.function.name,
                    "input": tool_input,
                    "result_summary": str(result)[:200],
                })
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False),
                })
            add_message(session_id, "user", tool_results)
        else:
            final_text = msg.content or ""
            add_message(session_id, "assistant", final_text)
            return {
                "response": final_text,
                "tool_calls": tool_calls_log,
                "plan": plan,
                "session_id": session_id,
                "language": language,
                "long_term_prefs": long_term_memory.get_all_preferences(session_id),
            }

    return {
        "response": ("处理超时，请重试。" if language == "zh"
                     else "Processing timed out, please retry."),
        "tool_calls": tool_calls_log,
        "plan": plan,
        "session_id": session_id,
        "language": language,
        "long_term_prefs": long_term_memory.get_all_preferences(session_id),
    }
