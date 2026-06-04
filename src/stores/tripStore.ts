import { create } from "zustand"
import type { Trip, DayPlan, Activity, TripMetadata, TripStatus } from "@/types"
import { tauriStorageService } from "@/services/tauriService"
import { useAuthStore } from "@/stores/authStore"
import {
  saveTripToServer,
  loadTripsFromServer,
  loadTripFromServer,
  deleteTripFromServer,
  type ServerTripMeta,
} from "@/services/backendApi"
import { toast } from "sonner"

interface TripState {
  currentTrip: Trip | null
  trips: TripMetadata[]
  isLoading: boolean
  error: string | null
  initialized: boolean
  setCurrentTrip: (trip: Trip | null) => void
  updateTripDay: (dayNumber: number, dayPlan: DayPlan) => void
  addActivity: (dayNumber: number, activity: Activity) => void
  setTrips: (trips: TripMetadata[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  loadTripsFromStorage: (force?: boolean) => Promise<void>
  loadTripById: (id: string) => Promise<Trip | null>
  saveTripToStorage: (trip: Trip) => Promise<void>
  deleteTripFromStorage: (id: string) => Promise<void>
  /** Clear in-memory trips (e.g. on login/logout so users never see each other's data). */
  reset: () => void
}

/** Trips persist server-side (per user) when authenticated; localStorage is the
 *  desktop/offline fallback. */
function isLoggedIn(): boolean {
  return !!useAuthStore.getState().token
}

function tripToMetadata(trip: Trip): TripMetadata {
  return {
    id: trip.id,
    name: trip.name,
    destination: `${trip.destination.name}, ${trip.destination.country}`,
    duration: trip.duration.days,
    status: trip.status,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  }
}

function serverMetaToMetadata(m: ServerTripMeta): TripMetadata {
  return {
    id: m.id,
    name: m.name,
    destination: m.destination,
    duration: m.duration || 0,
    status: (m.status as TripStatus) || "planning",
    createdAt: m.created_at ? new Date(m.created_at) : new Date(),
    updatedAt: m.updated_at ? new Date(m.updated_at) : new Date(),
  }
}

export const useTripStore = create<TripState>((set, get) => ({
  currentTrip: null,
  trips: [],
  isLoading: false,
  error: null,
  initialized: false,

  setCurrentTrip: (trip) => set({ currentTrip: trip }),

  updateTripDay: (dayNumber, dayPlan) =>
    set((state) => ({
      currentTrip: state.currentTrip
        ? {
            ...state.currentTrip,
            itinerary: state.currentTrip.itinerary.map((day) =>
              day.dayNumber === dayNumber ? dayPlan : day
            ),
            updatedAt: new Date(),
          }
        : null,
    })),

  addActivity: (dayNumber, activity) =>
    set((state) => ({
      currentTrip: state.currentTrip
        ? {
            ...state.currentTrip,
            itinerary: state.currentTrip.itinerary.map((day) =>
              day.dayNumber === dayNumber
                ? { ...day, activities: [...day.activities, activity] }
                : day
            ),
            updatedAt: new Date(),
          }
        : null,
    })),

  setTrips: (trips) => set({ trips }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  loadTripsFromStorage: async (force?: boolean) => {
    if (get().initialized && !force) return
    set({ isLoading: true, error: null })
    try {
      let metadata: TripMetadata[]
      if (isLoggedIn()) {
        const records = await loadTripsFromServer()
        metadata = records.map(serverMetaToMetadata)
      } else {
        const trips = await tauriStorageService.loadTrips()
        metadata = trips.map(tripToMetadata)
      }
      set({ trips: metadata, isLoading: false, initialized: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载行程失败"
      set({ isLoading: false, error: message, initialized: true })
      if (import.meta.env.DEV) {
        console.warn("[tripStore] Failed to load trips from storage:", message)
      }
    }
  },

  loadTripById: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const trip = isLoggedIn()
        ? await loadTripFromServer(id)
        : await tauriStorageService.loadTrip(id)
      set({ currentTrip: trip ?? null, isLoading: false })
      return trip
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载行程失败"
      set({ isLoading: false, error: message })
      if (import.meta.env.DEV) {
        console.warn("[tripStore] Failed to load trip:", message)
      }
      return null
    }
  },

  saveTripToStorage: async (trip) => {
    try {
      if (isLoggedIn()) {
        await saveTripToServer(trip)
      } else {
        await tauriStorageService.saveTrip(trip)
      }
      // Update trips list
      const metadata = tripToMetadata(trip)
      set((state) => ({
        trips: [
          metadata,
          ...state.trips.filter((t) => t.id !== trip.id),
        ],
        currentTrip: trip,
      }))
      toast.success("行程已保存")
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存行程失败"
      toast.error(message)
    }
  },

  deleteTripFromStorage: async (id) => {
    try {
      if (isLoggedIn()) {
        await deleteTripFromServer(id)
      } else {
        await tauriStorageService.deleteTrip(id)
      }
      set((state) => ({
        trips: state.trips.filter((t) => t.id !== id),
        currentTrip: state.currentTrip?.id === id ? null : state.currentTrip,
      }))
      toast.success("行程已删除")
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除行程失败"
      toast.error(message)
    }
  },

  reset: () => set({ currentTrip: null, trips: [], initialized: false, error: null }),
}))
