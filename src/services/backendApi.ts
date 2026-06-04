/**
 * Backend API client.
 *
 * Talks to the FastAPI travel-agent backend (LangChain-style tool-calling agent,
 * Plan-and-Execute planner, multi-hop RAG over Wikivoyage/Wikipedia, and a
 * persistent FAISS vector store for long-term memory). All the real "intelligence"
 * and the spec-required pieces live server-side; this module just calls them and
 * maps the structured response into the app's `Trip` type so the existing
 * itinerary cards + Leaflet map render unchanged.
 *
 * Base URL: VITE_BACKEND_URL (e.g. https://your-api.onrender.com/api) or, in dev,
 * the Vite proxy at "/api" -> http://localhost:8000.
 */

import type {
  Trip,
  DayPlan,
  Activity,
  UserPreferences,
  ActivityType,
  TripWeather,
} from "@/types"
import { useSessionStore } from "@/stores/sessionStore"
import { useUiStore } from "@/stores/uiStore"
import { useAuthStore } from "@/stores/authStore"

const BASE_URL: string = (import.meta.env.VITE_BACKEND_URL as string) || "/api"

/** Build fetch headers, adding Authorization when logged in. */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = useAuthStore.getState().token
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

// ── Backend response shapes ───────────────────────────────────────────────────

interface BackendActivity {
  type: string
  name: string
  description?: string
  locationName?: string
  address?: string
  latitude?: number
  longitude?: number
  startTime?: string
  endTime?: string
  duration?: number
  cost?: number
}

interface BackendDay {
  dayNumber: number
  notes?: string
  activities: BackendActivity[]
}

export interface BackendTripResponse {
  destination: { name: string; country: string; coordinates?: { lat: number; lng: number } }
  days: BackendDay[]
  weather?: unknown
  plan?: { steps?: Array<{ step: string; tool?: string }>; source?: string }
  plan_text?: string
  tool_calls?: Array<{ tool: string; input?: unknown; result_summary?: string }>
  sources?: string[]
  retrieval?: string
  used_llm?: boolean
  budget_tier?: string
  language?: string
  error?: string
  message?: string
}

export interface PlanTripParams {
  destination: string
  days: number
  interests?: string[]
  constraints?: string[]
  budget?: { min: number; max: number; currency: string }
}

const VALID_TYPES: ActivityType[] = [
  "transportation", "attraction", "dining", "accommodation", "shopping", "other",
]

function sessionId(): string {
  try {
    return useSessionStore.getState().session.id
  } catch {
    return `session-${Date.now()}`
  }
}

function currentLanguage(): "zh" | "en" {
  try {
    return useUiStore.getState().language
  } catch {
    return "zh"
  }
}

/**
 * Call POST /plan-trip and return the raw backend response.
 */
export async function planTripBackend(params: PlanTripParams): Promise<BackendTripResponse> {
  const res = await fetch(`${BASE_URL}/plan-trip`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      destination: params.destination,
      days: params.days,
      session_id: sessionId(),
      language: currentLanguage(),
      interests: params.interests ?? [],
      constraints: params.constraints ?? [],
      budget: params.budget ?? null,
    }),
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = body.detail || body.message || detail
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }

  const data = (await res.json()) as BackendTripResponse
  if (data.error) {
    throw new Error(data.message || data.error)
  }
  return data
}

/**
 * Map a backend response into the app's `Trip` type.
 */
export function mapBackendTrip(
  data: BackendTripResponse,
  requestedDays: number,
  preferences?: UserPreferences,
): Trip {
  const lang = (data.language as "zh" | "en") || currentLanguage()
  const destName = data.destination?.name || "—"
  const country = data.destination?.country || (lang === "zh" ? "未知" : "Unknown")

  const weather = (data.weather && typeof data.weather === "object" && !(data.weather as { error?: string }).error)
    ? (data.weather as TripWeather)
    : undefined
  const forecast = weather?.forecast ?? []

  const itinerary: DayPlan[] = (data.days || []).map((day) => {
    const activities: Activity[] = (day.activities || []).map((act, index) => {
      const type = (VALID_TYPES.includes(act.type as ActivityType)
        ? act.type
        : "other") as ActivityType
      const hasCoords = typeof act.latitude === "number" && typeof act.longitude === "number"
      return {
        id: `act-${day.dayNumber}-${index + 1}`,
        type,
        name: act.name || (lang === "zh" ? "活动" : "Activity"),
        description: act.description || "",
        location: {
          name: act.locationName || act.name || "",
          address: act.address || act.locationName || act.name || "",
          ...(hasCoords
            ? { coordinates: { lat: act.latitude as number, lng: act.longitude as number } }
            : {}),
        },
        time: {
          start: act.startTime || "09:00",
          end: act.endTime || "17:00",
          duration: act.duration ?? 120,
        },
        cost: act.cost ?? 0,
      }
    })

    const estimatedBudget = activities.reduce((sum, a) => sum + (a.cost || 0), 0)
    const dayWeather = forecast[day.dayNumber - 1]
    return {
      dayNumber: day.dayNumber,
      date: new Date(Date.now() + (day.dayNumber - 1) * 24 * 60 * 60 * 1000),
      activities,
      notes: day.notes || "",
      estimatedBudget,
      ...(dayWeather ? { weather: dayWeather } : {}),
    }
  })

  const days = itinerary.length || requestedDays
  const name = lang === "zh"
    ? `${destName}${days}日游`
    : `${days}-Day Trip to ${destName}`

  return {
    id: `trip-${Date.now()}`,
    name,
    destination: {
      name: destName,
      country,
      ...(data.destination?.coordinates ? { coordinates: data.destination.coordinates } : {}),
    },
    duration: {
      startDate: new Date(),
      endDate: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      days,
    },
    preferences: preferences || {
      interests: [],
      accommodationType: ["mid-range"],
      transportationPreference: ["public"],
      dietaryRestrictions: [],
      accessibilityNeeds: [],
    },
    itinerary,
    status: "planning",
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * Revive a Trip JSON blob returned by the server (date strings -> Date objects),
 * mirroring the desktop storage deserializer so cards/maps render unchanged.
 */
export function deserializeTrip(raw: Trip): Trip {
  return {
    ...raw,
    duration: {
      ...raw.duration,
      startDate: new Date(raw.duration.startDate),
      endDate: new Date(raw.duration.endDate),
    },
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    itinerary: (raw.itinerary || []).map((day) => ({
      ...day,
      date: new Date(day.date),
    })),
    ...(raw.messages
      ? { messages: raw.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })) }
      : {}),
  }
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string
  token_type: string
  user: { id: string; email: string }
}

async function authPost(path: string, body: object): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const authRegister = (email: string, password: string) =>
  authPost("/auth/register", { email, password })

export const authLogin = (email: string, password: string) =>
  authPost("/auth/login", { email, password })

// ── Trip persistence (requires auth) ─────────────────────────────────────────

export interface ServerTripMeta {
  id: string
  name: string
  destination: string
  duration: number
  status: string
  created_at: string
  updated_at: string
}

export async function saveTripToServer(trip: Trip): Promise<void> {
  const res = await fetch(`${BASE_URL}/trips`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ trip }),
  })
  if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`)
}

export async function loadTripsFromServer(): Promise<ServerTripMeta[]> {
  const res = await fetch(`${BASE_URL}/trips`, { headers: authHeaders() })
  if (!res.ok) return []
  return res.json()
}

/** Fetch one full trip (with revived Date objects) belonging to the user. */
export async function loadTripFromServer(tripId: string): Promise<Trip | null> {
  const res = await fetch(`${BASE_URL}/trips/${tripId}`, { headers: authHeaders() })
  if (!res.ok) return null
  const data = (await res.json()) as Trip
  return deserializeTrip(data)
}

export async function deleteTripFromServer(tripId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/trips/${tripId}`, {
    method: "DELETE",
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Delete failed: HTTP ${res.status}`)
}

// ── User preferences (per user, requires auth) ───────────────────────────────

/** Load this user's saved travel preferences, or null if none stored yet. */
export async function loadPreferencesFromServer(): Promise<Partial<UserPreferences> | null> {
  const res = await fetch(`${BASE_URL}/preferences`, { headers: authHeaders() })
  if (!res.ok) return null
  const body = (await res.json()) as { preferences: Partial<UserPreferences> | null }
  return body.preferences ?? null
}

/** Persist this user's travel preferences so future planning is personalized. */
export async function savePreferencesToServer(preferences: UserPreferences): Promise<void> {
  const res = await fetch(`${BASE_URL}/preferences`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ preferences }),
  })
  if (!res.ok) throw new Error(`Save preferences failed: HTTP ${res.status}`)
}

/**
 * Backend health probe (used by the status indicator).
 */
export async function backendHealth(): Promise<{ ok: boolean; model?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/health`)
    if (!res.ok) return { ok: false }
    const data = await res.json()
    return { ok: !!data.api_key_configured, model: data.llm_model }
  } catch {
    return { ok: false }
  }
}
