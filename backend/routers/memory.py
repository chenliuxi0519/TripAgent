from fastapi import APIRouter

from models.schemas import MemoryResponse
from memory.memory_manager import (
    get_conversation, clear_conversation,
    long_term_memory,
)

router = APIRouter()


@router.get("/memory/{session_id}", response_model=MemoryResponse)
async def get_memory(session_id: str):
    history = get_conversation(session_id)
    return MemoryResponse(
        session_id=session_id,
        short_term_count=len(history),
        long_term_preferences=long_term_memory.get_all_preferences(session_id),
        sessions=long_term_memory.list_sessions(),
    )


@router.delete("/memory/{session_id}")
async def clear_memory(session_id: str, long_term: bool = False):
    """Clear short-term conversation. Pass ?long_term=true to also forget
    persisted preferences for this session."""
    clear_conversation(session_id)
    removed = 0
    if long_term:
        removed = long_term_memory.clear_session(session_id)
    return {"cleared": True, "session_id": session_id,
            "long_term_removed": removed}
