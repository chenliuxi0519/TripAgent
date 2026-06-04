import { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Plane, Moon, Sun, Plus, User, Languages, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUiStore } from "@/stores/uiStore"
import { useChatStore } from "@/stores/chatStore"
import { useTripStore } from "@/stores/tripStore"
import { useAuthStore } from "@/stores/authStore"
import { resetPreferencesLocal } from "@/services/preferenceSync"
import { useT } from "@/i18n"
import { AnimatePresence, motion } from "framer-motion"

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, lang } = useT()
  const authUser = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const darkMode = useUiStore((state) => state.darkMode)
  const setDarkMode = useUiStore((state) => state.setDarkMode)
  const toggleLanguage = useUiStore((state) => state.toggleLanguage)
  const clearMessages = useChatStore((state) => state.clearMessages)
  const currentTrip = useTripStore((state) => state.currentTrip)
  const saveTripToStorage = useTripStore((state) => state.saveTripToStorage)
  const setCurrentTrip = useTripStore((state) => state.setCurrentTrip)
  const resetTrips = useTripStore((state) => state.reset)
  const [isNewTripAnimating, setIsNewTripAnimating] = useState(false)

  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
  }

  const handleLogout = () => {
    clearAuth()
    // Clear in-memory trips + preferences so the next user doesn't inherit them.
    resetTrips()
    resetPreferencesLocal()
    clearMessages()
    navigate("/login")
  }

  const handleNewTrip = async () => {
    setIsNewTripAnimating(true)

    // Save current trip to sidebar before clearing
    if (currentTrip) {
      try {
        await saveTripToStorage(currentTrip)
      } catch {
        // Continue even if save fails
      }
    }

    clearMessages()
    setCurrentTrip(null)
    navigate("/")
    setTimeout(() => setIsNewTripAnimating(false), 300)
  }

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6 transition-colors duration-300">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          aria-label={t("detail.backHome")}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Plane className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold">Trip Agent</h1>
        </button>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {t("header.beta")}
        </span>
      </div>

      <nav className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/dashboard")}
          className={location.pathname === "/dashboard" ? "bg-accent" : ""}
        >
          <User className="h-4 w-4 mr-1" />
          {t("header.dashboard")}
        </Button>

        {/* User email + logout */}
        {authUser && (
          <>
            <span className="hidden sm:block text-xs text-muted-foreground max-w-[120px] truncate" title={authUser.email}>
              {authUser.email}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              title={t("auth.logout")}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        )}

        <div className="w-px h-6 bg-border mx-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLanguage}
          title={t("header.langTitle")}
          className="font-medium transition-colors"
        >
          <Languages className="h-4 w-4 mr-1" />
          {lang === "zh" ? "中" : "EN"}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDarkMode}
          title={darkMode ? t("header.toLight") : t("header.toDark")}
          className="transition-colors"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={darkMode ? "dark" : "light"}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </motion.div>
          </AnimatePresence>
        </Button>

        <motion.div
          animate={isNewTripAnimating ? { scale: [1, 0.95, 1] } : {}}
          transition={{ duration: 0.2 }}
        >
          <Button
            variant="default"
            size="sm"
            onClick={handleNewTrip}
            className="ml-1"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("header.newTrip")}
          </Button>
        </motion.div>
      </nav>
    </header>
  )
}
