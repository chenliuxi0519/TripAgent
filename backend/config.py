"""
Centralised configuration.

All environment access goes through this module so the rest of the codebase
never reads os.getenv directly. `.env` is loaded once on import (local dev);
in cloud deployments the platform injects real environment variables.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load the project-root .env if present (no-op in cloud where vars are injected)
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH, override=False)
load_dotenv(override=False)  # also pick up backend/.env or CWD .env


class Settings:
    # ── LLM (provider-agnostic, via any OpenAI-compatible endpoint) ──────────
    # Default = Zhipu GLM-4-Flash (free, China). Switch provider by changing
    # these env vars only — the agent/RAG/memory code is untouched.
    #   Zhipu     : base https://open.bigmodel.cn/api/paas/v4/  model glm-4-flash
    #   DashScope : base https://dashscope.aliyuncs.com/compatible-mode/v1  model qwen-plus
    #   DeepSeek  : base https://api.deepseek.com/v1            model deepseek-chat
    #   Gemini    : base https://generativelanguage.googleapis.com/v1beta/openai/  model gemini-2.5-flash
    # Back-compat: GEMINI_API_KEY / GEMINI_BASE_URL still read if LLM_* unset.
    LLM_API_KEY: str = (os.getenv("LLM_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip()
    LLM_BASE_URL: str = (
        os.getenv("LLM_BASE_URL")
        or os.getenv("GEMINI_BASE_URL")
        or "https://open.bigmodel.cn/api/paas/v4/"
    ).strip()
    LLM_MODEL: str = os.getenv("LLM_MODEL", "glm-4-flash").strip()

    # Embeddings — same provider/key by default. Zhipu: embedding-3 (dim 2048).
    # If embeddings error, memory/RAG fall back to keyword retrieval gracefully.
    EMBEDDING_API_KEY: str = (
        os.getenv("EMBEDDING_API_KEY") or os.getenv("LLM_API_KEY")
        or os.getenv("GEMINI_API_KEY") or ""
    ).strip()
    EMBEDDING_BASE_URL: str = (
        os.getenv("EMBEDDING_BASE_URL") or os.getenv("LLM_BASE_URL")
        or os.getenv("GEMINI_BASE_URL")
        or "https://open.bigmodel.cn/api/paas/v4/"
    ).strip()
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "embedding-3").strip()
    EMBEDDING_DIM: int = int(os.getenv("EMBEDDING_DIM", "2048"))

    # ── Real travel data APIs ───────────────────────────────────────────────
    # OpenTripMap (free key) — attractions / POIs. Optional: a keyless
    # Wikipedia fallback is used when this is empty.
    OPENTRIPMAP_API_KEY: str = os.getenv("OPENTRIPMAP_API_KEY", "").strip()

    # Flights & hotels use simulated data (see services/mock_travel.py): no free
    # real flight/hotel API remains (Amadeus retired its self-service portal).

    # ── Agent behaviour ─────────────────────────────────────────────────────
    # Use an extra LLM call to generate the plan. Off by default to conserve the
    # free-tier quota — a deterministic planner is used instead (still real
    # "custom logic" planning). Set to "1"/"true" to enable LLM planning.
    PLANNER_USE_LLM: bool = os.getenv("PLANNER_USE_LLM", "false").lower() in ("1", "true", "yes")
    MAX_TOOL_ITERATIONS: int = int(os.getenv("MAX_TOOL_ITERATIONS", "6"))
    # Time budget (seconds) for the multi-hop RAG step inside /plan-trip. If the
    # crawl+embed exceeds this, planning proceeds with real attractions+weather.
    RAG_TIMEOUT: float = float(os.getenv("RAG_TIMEOUT", "25"))
    # Time budget (seconds) for the LLM itinerary synthesis. On a slow/throttled
    # free tier, exceeding this falls back to a real-attraction itinerary so the
    # response stays prompt and predictable.
    LLM_TIMEOUT: float = float(os.getenv("LLM_TIMEOUT", "45"))

    # ── Storage ─────────────────────────────────────────────────────────────
    DATA_DIR: str = os.getenv("DATA_DIR", str(Path(__file__).resolve().parent / "data"))

    # ── Networking ──────────────────────────────────────────────────────────
    HTTP_TIMEOUT: float = float(os.getenv("HTTP_TIMEOUT", "15"))
    # Wikimedia APIs require a descriptive User-Agent with contact info, or they
    # return HTTP 429. Override via env in production with your own contact.
    USER_AGENT: str = os.getenv(
        "USER_AGENT",
        "TravelMindAgent/2.0 (travel-planning-agent; contact: travelmind.app@gmail.com)",
    )

    @property
    def llm_configured(self) -> bool:
        return bool(self.LLM_API_KEY)


settings = Settings()
