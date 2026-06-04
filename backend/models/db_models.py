"""
SQLAlchemy ORM models for users and trips.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    trips = relationship("TripRecord", back_populates="owner", cascade="all, delete-orphan")


class TripRecord(Base):
    __tablename__ = "trips"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    data = Column(Text, nullable=False)   # full Trip JSON blob
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    owner = relationship("User", back_populates="trips")


class UserPreferenceRecord(Base):
    """Per-user travel preferences (interests, budget, accommodation, …).

    One row per user; `data` holds the frontend UserPreferences JSON so future
    trip planning can be tailored to this user across sessions/devices.
    """
    __tablename__ = "user_preferences"

    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"),
                     primary_key=True)
    data = Column(Text, nullable=False, default="{}")  # UserPreferences JSON
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)
