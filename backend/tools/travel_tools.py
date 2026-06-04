"""
Tool definitions for the travel planning agent.

Tools use REAL external APIs, except flights/hotels which are simulated (the task
spec permits a mock flight/hotel API, and no free real one remains):
  get_weather          -> Open-Meteo (keyless)
  search_attractions   -> OpenTripMap / Wikipedia geosearch
  research_destination -> multi-hop RAG over Wikivoyage + Wikipedia
  search_flights       -> simulated (distance-grounded mock; see services/mock_travel.py)
  search_hotels        -> simulated (mock by budget tier; see services/mock_travel.py)
  web_search           -> DuckDuckGo / Wikipedia
  save_user_preference -> long-term memory (handled in the agent loop)

The schemas are Anthropic-style and converted to OpenAI tool format by the agent.
"""
from __future__ import annotations

from typing import Any

from services.weather import get_weather
from services.places import search_attractions
from services.mock_travel import search_flights, search_hotels
from services.websearch import web_search
from rag.retriever import research_destination


TOOL_SCHEMAS = [
    {
        "name": "get_weather",
        "description": "Get real current weather and a multi-day forecast for a city "
                       "(Open-Meteo). Use to advise on what to pack and outdoor timing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "City name, e.g. Tokyo"},
                "language": {"type": "string", "enum": ["zh", "en"]},
            },
            "required": ["city"],
        },
    },
    {
        "name": "search_attractions",
        "description": "Search real attractions, restaurants and activities near a city "
                       "(OpenTripMap, with a Wikipedia fallback). Filter by category.",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {"type": "string"},
                "category": {
                    "type": "string",
                    "enum": ["all", "sightseeing", "food", "nature", "culture",
                             "shopping", "nightlife"],
                },
                "budget": {"type": "string", "enum": ["budget", "mid-range", "luxury", "any"]},
                "pet_friendly": {"type": "boolean"},
            },
            "required": ["city"],
        },
    },
    {
        "name": "research_destination",
        "description": "Multi-hop RAG: retrieve detailed, factual passages about a "
                       "destination from Wikivoyage + Wikipedia (city guide -> specific "
                       "attractions). Use for rich, accurate descriptions, history, "
                       "neighbourhoods, local tips and itinerary depth.",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {"type": "string"},
                "focus": {"type": "string",
                          "description": "What to focus retrieval on, e.g. 'food', "
                                         "'historic temples', 'family activities'"},
                "language": {"type": "string", "enum": ["zh", "en"]},
            },
            "required": ["city"],
        },
    },
    {
        "name": "search_flights",
        "description": "Search flight options between two cities (simulated; prices are "
                       "distance-based estimates). Returns airline, times, stops and price. "
                       "Needs origin, destination, date.",
        "input_schema": {
            "type": "object",
            "properties": {
                "origin": {"type": "string", "description": "Departure city"},
                "destination": {"type": "string"},
                "date": {"type": "string", "description": "YYYY-MM-DD"},
                "passengers": {"type": "integer", "default": 1},
            },
            "required": ["origin", "destination", "date"],
        },
    },
    {
        "name": "search_hotels",
        "description": "Search hotel options in a city (simulated; realistic prices by "
                       "budget tier). Filter by budget and pet-friendliness.",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {"type": "string"},
                "check_in": {"type": "string", "description": "YYYY-MM-DD"},
                "check_out": {"type": "string", "description": "YYYY-MM-DD"},
                "budget": {"type": "string", "enum": ["budget", "mid-range", "luxury", "any"]},
                "pet_friendly": {"type": "boolean"},
            },
            "required": ["city"],
        },
    },
    {
        "name": "web_search",
        "description": "Search the open web (DuckDuckGo, Wikipedia fallback) for fresh "
                       "or niche information not covered by the other tools, e.g. current "
                       "events, festivals, opening status, visa basics.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "save_user_preference",
        "description": "Save a durable user preference (travel style, food, budget, "
                       "interests, constraints) to long-term memory for personalization.",
        "input_schema": {
            "type": "object",
            "properties": {
                "preference_type": {
                    "type": "string",
                    "enum": ["travel_style", "food_preference", "budget",
                             "interests", "constraints"],
                },
                "value": {"type": "string"},
                "session_id": {"type": "string"},
            },
            "required": ["preference_type", "value", "session_id"],
        },
    },
]


async def execute_tool(tool_name: str, tool_input: dict) -> Any:
    """Dispatch a tool call. Never raises — returns an error dict on failure so the
    agent loop stays alive even if one upstream API misbehaves."""
    try:
        if tool_name == "get_weather":
            return await get_weather(
                city=tool_input["city"],
                language=tool_input.get("language", "zh"),
            )
        if tool_name == "search_attractions":
            return await search_attractions(
                city=tool_input["city"],
                category=tool_input.get("category", "all"),
                budget=tool_input.get("budget", "any"),
                pet_friendly=tool_input.get("pet_friendly", False),
            )
        if tool_name == "research_destination":
            return await research_destination(
                city=tool_input["city"],
                focus=tool_input.get("focus", ""),
                language=tool_input.get("language", "zh"),
            )
        if tool_name == "search_flights":
            return await search_flights(
                origin=tool_input["origin"],
                destination=tool_input["destination"],
                date=tool_input["date"],
                passengers=tool_input.get("passengers", 1),
            )
        if tool_name == "search_hotels":
            return await search_hotels(
                city=tool_input["city"],
                check_in=tool_input.get("check_in"),
                check_out=tool_input.get("check_out"),
                budget=tool_input.get("budget", "any"),
                pet_friendly=tool_input.get("pet_friendly", False),
            )
        if tool_name == "web_search":
            return await web_search(query=tool_input["query"])
        if tool_name == "save_user_preference":
            return {
                "saved": True,
                "preference_type": tool_input.get("preference_type"),
                "value": tool_input.get("value"),
            }
        return {"error": f"Unknown tool: {tool_name}"}
    except Exception as exc:  # last-resort guard
        return {"error": "tool_execution_failed", "tool": tool_name, "detail": str(exc)}
