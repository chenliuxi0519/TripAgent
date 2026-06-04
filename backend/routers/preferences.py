"""
Per-user travel preferences: load / save the preferences the planner uses to
personalize itineraries for the authenticated user.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.db_models import User, UserPreferenceRecord
from routers.auth import get_current_user

router = APIRouter(prefix="/preferences", tags=["preferences"])


class SavePreferencesRequest(BaseModel):
    preferences: dict  # full UserPreferences JSON from the frontend


@router.get("")
def get_preferences(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = db.query(UserPreferenceRecord).filter(
        UserPreferenceRecord.user_id == user.id
    ).first()
    if not record:
        return {"preferences": None}
    try:
        return {"preferences": json.loads(record.data)}
    except (ValueError, TypeError):
        return {"preferences": None}


@router.put("")
def save_preferences(
    body: SavePreferencesRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    payload = json.dumps(body.preferences, ensure_ascii=False)
    record = db.query(UserPreferenceRecord).filter(
        UserPreferenceRecord.user_id == user.id
    ).first()
    if record:
        record.data = payload
    else:
        record = UserPreferenceRecord(user_id=user.id, data=payload)
        db.add(record)
    db.commit()
    return {"saved": True}
