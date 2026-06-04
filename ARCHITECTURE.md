# Trip Agent — Technical Document

Brief design notes covering architecture, tool selection, and memory design.

## 1. Architecture

Two deployable units, one REST contract between them.

```
React + Vite frontend                         FastAPI backend
─────────────────────                         ───────────────
chat UI · itinerary cards · Leaflet map        ┌─ routers/  (HTTP surface)
export (PDF/MD) · auth · preferences           │   /api/chat          → conversational agent
        │                                       │   /api/plan-trip     → structured itinerary
        │  fetch (backendApi.ts)                │   /api/trips         → per-user trip CRUD
        ▼                                       │   /api/preferences   → per-user preferences
   VITE_BACKEND_URL ──────────────────────────▶│   /api/auth          → register/login (JWT)
                                                ├─ agents/   travel_agent (tool loop), trip_planner
                                                ├─ planning/ Plan-and-Execute decomposition
                                                ├─ rag/      multi-hop retriever (FAISS)
                                                ├─ memory/   short-term window + long-term FAISS
                                                ├─ tools/ + services/  real & mock tool APIs
                                                └─ models/   SQLAlchemy (SQLite) + Pydantic
```

**Two agent entry points, by design:**
- `POST /api/chat` → `agents/travel_agent.py`: a LangChain-style **tool-calling loop** where
  the LLM decides which tool to call each turn (the spec's "agent decides dynamically"). It
  can use all 7 tools including flights/hotels.
- `POST /api/plan-trip` → `agents/trip_planner.py`: a **goal-driven structured planner** that
  the web UI calls to render itinerary cards + a map. It gathers weather + real attractions +
  multi-hop RAG in parallel, then has the LLM synthesise day-by-day JSON, with a deterministic
  fallback so the user always gets a usable plan.

**Reasoning is provider-agnostic** — any OpenAI-compatible endpoint via `LLM_BASE_URL`
(default Zhipu GLM-4-Flash, free). Every upstream call is defensive: a flaky API degrades
gracefully instead of failing the request.

## 2. Tool selection

Schemas live in `tools/travel_tools.py`; the agent converts them to OpenAI tool format and
the model chooses. `execute_tool()` dispatches and never raises (returns an error dict).

| Tool | Backing service | Real? |
|------|-----------------|-------|
| `get_weather` | Open-Meteo | Real, keyless |
| `search_attractions` | OpenTripMap → Wikipedia geosearch | Real, keyless fallback |
| `research_destination` | Wikivoyage + Wikipedia (multi-hop RAG) | Real, keyless |
| `web_search` | DuckDuckGo → Wikipedia | Real, keyless |
| `search_flights` / `search_hotels` | `mock_travel.py` | **Simulated** (distance-grounded, labelled `source: "Simulated"`) |
| `save_user_preference` | long-term memory | — |

Rationale: prefer **free, keyless real APIs** so the project runs without paid keys; flights
and hotels are mocked because no free real API remains (Amadeus retired its self-service
portal), which the task explicitly permits. The agent is told to label simulated data as
estimates and never invent real values.

## 3. Memory design

**Short-term (conversation context)** — `memory/memory_manager.py`: in-process history keyed
by `session_id` with a sliding window (`_MAX_TURNS`) so prompts stay bounded over long chats.
The frontend also persists each conversation with its trip (a trip == a conversation), so a
chat can be reopened and continued, and follow-ups inherit the active trip's context.

**Long-term (vector DB, cross-session)** — a persistent **FAISS** store (`IndexFlatIP`) of
user preferences. On `save_user_preference`, the value is embedded and added to the index;
both the index (`long_term.index`) and metadata (`long_term.json`) are written under
`DATA_DIR`, so preferences survive restarts and span sessions. Retrieval is semantic (vector
similarity) scoped to the session, with a recency fallback when embeddings are unavailable.

**Relational (per-user records)** — SQLite via SQLAlchemy: `users`, `trips`, and
`user_preferences` tables, isolated per authenticated user (JWT). This is what makes saved
trips and profile preferences durable and account-scoped.

## 4. Planning & multi-hop RAG

- **Planning** (`planning/planner.py`): decomposes the goal into ordered sub-tasks
  (Plan-and-Execute). Deterministic by default to conserve free-tier quota; set
  `PLANNER_USE_LLM=1` for an LLM-generated plan.
- **Multi-hop RAG** (`rag/retriever.py`): Hop 1 fetches the city guide (Wikivoyage +
  Wikipedia); Hop 2 drills into specific real attractions' Wikipedia pages; everything is
  chunked, embedded, indexed in FAISS, and queried by the user's focus. Per-city indices are
  cached in-process.

## 5. Deployment

Both services on Render via `render.yaml`: backend as a Docker web service with a persistent
disk at `DATA_DIR` (SQLite + FAISS); frontend as a static site built with `npm run build`.
See [README.md](README.md) for step-by-step instructions.
