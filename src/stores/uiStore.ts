import { create } from "zustand"
import { persist } from "zustand/middleware"

export type Language = "zh" | "en"

interface UiState {
  sidebarOpen: boolean
  selectedTripId: string | null
  darkMode: boolean
  settingsOpen: boolean
  language: Language
  toggleSidebar: () => void
  setSelectedTripId: (tripId: string | null) => void
  setDarkMode: (darkMode: boolean) => void
  toggleSettings: () => void
  setSettingsOpen: (settingsOpen: boolean) => void
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      selectedTripId: null,
      darkMode: false,
      settingsOpen: false,
      language: "zh",

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setLanguage: (language) => set({ language }),

      toggleLanguage: () => set((state) => ({ language: state.language === "zh" ? "en" : "zh" })),

      setSelectedTripId: (tripId) => set({ selectedTripId: tripId }),

      setDarkMode: (darkMode) => {
        // Apply dark mode class immediately
        if (darkMode) {
          document.documentElement.classList.add("dark")
        } else {
          document.documentElement.classList.remove("dark")
        }
        return set({ darkMode })
      },

      toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),

      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    }),
    {
      name: "trip-agent-ui",
      partialize: (state) => ({
        darkMode: state.darkMode,
        sidebarOpen: state.sidebarOpen,
        language: state.language,
      }),
      onRehydrateStorage: () => (state) => {
        // Restore dark mode class on page load
        if (state?.darkMode) {
          document.documentElement.classList.add("dark")
        }
      },
    }
  )
)
