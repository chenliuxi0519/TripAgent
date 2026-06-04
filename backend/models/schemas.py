from pydantic import BaseModel, Field
from typing import Optional
import uuid


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))
    language: Optional[str] = Field(default="zh", pattern="^(zh|en)$")


class BudgetRange(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None
    currency: Optional[str] = "CNY"


class TripPlanRequest(BaseModel):
    destination: str = Field(..., min_length=1, max_length=120)
    days: int = Field(default=2, ge=1, le=14)
    session_id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))
    language: Optional[str] = Field(default="zh", pattern="^(zh|en)$")
    interests: list[str] = []
    constraints: list[str] = []
    budget: Optional[BudgetRange] = None
    start_date: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    language: str
    tool_calls: list = []
    plan: dict = {}
    long_term_prefs: dict = {}


class MemoryResponse(BaseModel):
    session_id: str
    short_term_count: int
    long_term_preferences: dict
    sessions: list


class ClearMemoryRequest(BaseModel):
    session_id: str
