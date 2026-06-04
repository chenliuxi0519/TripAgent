from fastapi import APIRouter, HTTPException

from models.schemas import TripPlanRequest
from agents.trip_planner import plan_trip

router = APIRouter()


@router.post("/plan-trip")
async def plan_trip_endpoint(request: TripPlanRequest):
    """Generate a structured, coordinate-grounded itinerary for the web UI.

    Returns days -> activities (with real lat/lng), plan steps, tool calls and
    RAG sources. Real free-API data; never raises on upstream hiccups.
    """
    if not request.destination.strip():
        raise HTTPException(status_code=400, detail="destination cannot be empty")
    try:
        result = await plan_trip(
            session_id=request.session_id,
            destination=request.destination,
            days=request.days,
            language=request.language or "zh",
            interests=request.interests,
            budget=request.budget.model_dump() if request.budget else None,
            constraints=request.constraints,
            start_date=request.start_date,
        )
        return result
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Trip planning error: {e}")
