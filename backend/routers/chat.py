from fastapi import APIRouter, HTTPException
from models.schemas import ChatRequest, ChatResponse
from agents.travel_agent import run_agent

router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    try:
        result = await run_agent(
            session_id=request.session_id,
            user_message=request.message,
            language=request.language or "zh"
        )
        return ChatResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")
