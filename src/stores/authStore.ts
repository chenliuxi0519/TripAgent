/**
 * Auth state: JWT token + user info.
 * Token is persisted to localStorage so it survives page reloads.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface AuthUser {
  id: string
  email: string
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  setAuth: (token: string, user: AuthUser) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      setAuth: (token, user) => set({ token, user }),

      clearAuth: () => set({ token: null, user: null }),

      isAuthenticated: () => !!get().token,
    }),
    {
      name: "trip-agent-auth",
      partialize: (s) => ({ token: s.token, user: s.user }),
    }
  )
)
