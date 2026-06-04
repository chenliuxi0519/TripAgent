# TravelMind — AI Travel Planning Agent

TravelMind helps you plan a trip to any city just by chatting. You tell it where you
want to go (and anything you care about — budget, food, pets…), and it builds a
day-by-day itinerary. Behind the scenes it acts like a real travel agent: it checks the
**weather**, looks up **real attractions**, **searches the web**, **remembers what you
like**, and reads up on the city from **Wikipedia / Wikivoyage**.

It's made of two parts:

- **Backend** (`backend/`) — a **FastAPI** service that holds the "brain": the agent, its
  tools, memory, planning, and retrieval (RAG).
- **Frontend** (`src/`) — a **React** web app where you chat, see the plan on a map, and
  export it to PDF.

```
   You ──chat──►  React web app  ──REST──►  FastAPI agent  ──►  weather / attractions /
                  (map, export)             (tools, memory)      web search / Wikipedia
```

## What it does (and where to find it)

- **Uses several tools and decides which to call** — 7 tools in `backend/tools/`, driven by
  a tool-calling loop in `backend/agents/travel_agent.py`. They are: weather (Open-Meteo),
  attractions (OpenTripMap/Wikipedia), web search (DuckDuckGo), multi-hop RAG, mock
  flights/hotels, and "remember a preference".
- **Remembers things** — short-term: the conversation; long-term: a **FAISS** vector
  database of your preferences that survives across sessions (`backend/memory/`).
- **Plans and reasons** — breaks the goal into steps (`backend/planning/`) and pulls facts
  with multi-hop retrieval (`backend/rag/`).
- **Talks to you** — a chat API (`POST /api/chat`) plus the web UI; it asks follow-up
  questions when your request is vague.
- **Bonus** — handles constraints (budget, pet-friendly) and works in English & Chinese.

Your account, saved trips, and preferences are kept per-user in a small SQLite database.
For the full design write-up, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Run it on your computer

You need **Node.js 18+** and **Python 3.11+**. Open two terminals.

**Terminal 1 — the backend:**
```bash
cd backend
pip install -r requirements.txt
# Add your LLM key (default model is Zhipu GLM-4-Flash, which is free):
#   Windows PowerShell:  $env:LLM_API_KEY="your-key"
#   macOS/Linux:         export LLM_API_KEY=your-key
uvicorn main:app --reload --port 8000
```

**Terminal 2 — the frontend:**
```bash
npm install
npm run dev
```

Now open http://localhost:5173, sign up, and start planning. (The dev server forwards
`/api` calls to the backend automatically.)

### Settings

The only thing you must set is `LLM_API_KEY`. Everything else is optional:

| Variable | What it's for |
|----------|---------------|
| `LLM_API_KEY` | **Required.** Your LLM key (any OpenAI-compatible provider). |
| `LLM_BASE_URL` / `LLM_MODEL` | Switch provider/model (defaults to free GLM-4-Flash). |
| `OPENTRIPMAP_API_KEY` | Optional — nicer attraction data (falls back to Wikipedia). |
| `DATA_DIR` | Where the database and memory files are stored. |

Weather, attractions, web search and RAG all use **free, key-less** APIs. Flights and
hotels are simulated (no free real API exists for them).

## Tests

```bash
npm run test:run
```

## Put it online (Render)

Both parts can run on [Render](https://render.com) using the included
[`render.yaml`](render.yaml):

1. Push the project to GitHub.
2. On Render: **New → Blueprint → pick your repo.** It creates the backend (Docker) and
   the frontend (static site) for you.
3. On the backend service, set `LLM_API_KEY`.
4. On the frontend service, set `VITE_BACKEND_URL` to the backend's URL + `/api`
   (e.g. `https://travelmind-backend.onrender.com/api`) and redeploy.

> The free plan is fine for a demo, but saved data resets when the service restarts. For
> permanent storage, attach a paid disk (see the comments in `render.yaml`).

## Folder layout

```
backend/        FastAPI agent
  agents/       the chat agent + the structured trip planner
  tools/        tool definitions the agent can call
  services/     weather, places, web search, mock flights/hotels
  rag/          multi-hop retrieval (FAISS)
  memory/       short-term conversation + long-term FAISS store
  planning/     break the goal into steps
  routers/      the API endpoints (chat, trips, auth, preferences, …)
src/            React web app (chat, itinerary cards, map, export)
render.yaml     one-click deploy config for Render
```
