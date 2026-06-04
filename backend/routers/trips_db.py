"""
Trip persistence: save / list / delete trips per authenticated user.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.db_models import User, TripRecord
from routers.auth import get_current_user

router = APIRouter(prefix="/trips", tags=["trips"])


class SaveTripRequest(BaseModel):
    trip: dict   # full Trip JSON from the frontend


class TripMeta(BaseModel):
    id: str
    name: str
    destination: str
    created_at: str
    updated_at: str


@router.post("")
def save_trip(
    body: SaveTripRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip_data = body.trip
    trip_id = trip_data.get("id", "")

    # Upsert: update if exists and belongs to this user, else create
    record = db.query(TripRecord).filter(
        TripRecord.id == trip_id, TripRecord.user_id == user.id
    ).first()

    if record:
        record.name = trip_data.get("name", record.name)
        record.destination = trip_data.get("destination", {}).get("name", record.destination)
        record.data = json.dumps(trip_data, ensure_ascii=False)
        record.updated_at = datetime.now(timezone.utc)
    else:
        record = TripRecord(
            id=trip_id or None,
            user_id=user.id,
            name=trip_data.get("name", "Trip"),
            destination=trip_data.get("destination", {}).get("name", ""),
            data=json.dumps(trip_data, ensure_ascii=False),
        )
        db.add(record)

    db.commit()
    db.refresh(record)
    return {"id": record.id, "saved": True}


@router.get("")
def list_trips(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    records = (
        db.query(TripRecord)
        .filter(TripRecord.user_id == user.id)
        .order_by(TripRecord.updated_at.desc())
        .all()
    )

    def _meta(r: TripRecord) -> dict:
        days, status = 0, "planning"
        try:
            d = json.loads(r.data)
            days = (d.get("duration") or {}).get("days") or 0
            status = d.get("status") or "planning"
        except Exception:  # noqa: BLE001 — bad blob shouldn't break the list
            pass
        return {
            "id": r.id,
            "name": r.name,
            "destination": r.destination,
            "duration": days,
            "status": status,
            "created_at": r.created_at.isoformat() if r.created_at else "",
            "updated_at": r.updated_at.isoformat() if r.updated_at else "",
        }

    return [_meta(r) for r in records]


@router.get("/{trip_id}")
def get_trip(
    trip_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = db.query(TripRecord).filter(
        TripRecord.id == trip_id, TripRecord.user_id == user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Trip not found")
    return json.loads(record.data)


@router.delete("/{trip_id}")
def delete_trip(
    trip_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = db.query(TripRecord).filter(
        TripRecord.id == trip_id, TripRecord.user_id == user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Trip not found")
    db.delete(record)
    db.commit()
    return {"deleted": True}
