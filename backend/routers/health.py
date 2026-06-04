from fastapi import APIRouter

from config import settings

router = APIRouter()


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "2.0.0",
        "api_key_configured": settings.llm_configured,
        "llm_model": settings.LLM_MODEL,
        "tools": {
            "weather": "Open-Meteo (live)",
            "attractions": "OpenTripMap (live)" if settings.OPENTRIPMAP_API_KEY
                           else "Wikipedia geosearch (live, keyless fallback)",
            "flights": "Simulated (distance-based estimates)",
            "hotels": "Simulated (by budget tier)",
            "rag": "Wikivoyage + Wikipedia multi-hop",
            "web_search": "DuckDuckGo / Wikipedia",
        },
    }
