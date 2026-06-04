import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config  # noqa: F401 — loads .env on import
from database import init_db
from routers import chat, memory, health, trip
from routers.auth import router as auth_router
from routers.trips_db import router as trips_db_router
from routers.preferences import router as preferences_router
from services.http_client import close_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup — create DB tables (idempotent)
    init_db()
    yield
    # shutdown: release the shared HTTP client cleanly
    await close_client()


app = FastAPI(
    title="Intelligent Travel Planning AI Agent",
    description="AI-powered 2-day trip planner with real-API tools, multi-hop RAG, "
                "planning, and persistent memory.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(auth_router, prefix="/api")
app.include_router(trips_db_router, prefix="/api")
app.include_router(preferences_router, prefix="/api")
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(trip.router, prefix="/api", tags=["trip"])
app.include_router(memory.router, prefix="/api", tags=["memory"])


@app.get("/")
async def root():
    return {"service": "TravelMind", "docs": "/docs", "health": "/api/health"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
