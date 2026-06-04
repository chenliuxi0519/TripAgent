/**
 * Per-user preference sync.
 *
 * Travel preferences live in the session store (used by the planner), but must
 * be persisted per authenticated user so they follow the user across sessions
 * and devices, and never leak between accounts on the same browser. This module
 * bridges the session store and the backend `/api/preferences` endpoints.
 */
import { useAuthStore } from "@/stores/authStore"
import { useSessionStore } from "@/stores/sessionStore"
import { loadPreferencesFromServer, savePreferencesToServer } from "@/services/backendApi"
import type { UserPreferences } from "@/types"

const DEFAULT_PREFS: UserPreferences = {
  interests: [],
  accommodationType: ["mid-range"],
  transportationPreference: ["public"],
  dietaryRestrictions: [],
  accessibilityNeeds: [],
}

function isLoggedIn(): boolean {
  return !!useAuthStore.getState().token
}

/** Load the user's server-side preferences into the session (login / app start). */
export async function syncPreferencesFromServer(): Promise<void> {
  if (!isLoggedIn()) return
  try {
    const remote = await loadPreferencesFromServer()
    if (remote) {
      useSessionStore.getState().setPreferences({ ...DEFAULT_PREFS, ...remote })
    }
  } catch {
    /* keep local prefs on failure */
  }
}

/** Reset preferences to defaults (logout, or before loading another user's). */
export function resetPreferencesLocal(): void {
  useSessionStore.getState().setPreferences({ ...DEFAULT_PREFS })
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

/** Debounced per-user save of preferences to the backend. */
export function persistPreferences(preferences: UserPreferences): void {
  if (!isLoggedIn()) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void savePreferencesToServer(preferences).catch(() => {})
  }, 600)
}
