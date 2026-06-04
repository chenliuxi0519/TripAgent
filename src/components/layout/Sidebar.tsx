import { useState, useEffect, useMemo } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { MapPin, Calendar, Search, Plane, Archive, ChevronDown, Trash2 } from "lucide-react"
import { useTripStore } from "@/stores/tripStore"
import { useChatStore } from "@/stores/chatStore"
import { useUiStore } from "@/stores/uiStore"
import { TRIP_STATUS_COLORS } from "@/constants/tripStatus"
import type { ChatMessage } from "@/types"
import { useT } from "@/i18n"
import type { TripStatus } from "@/types"
import { AnimatePresence, motion } from "framer-motion"

type FilterStatus = "all" | TripStatus

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useT()
  const trips = useTripStore((state) => state.trips)
  const isLoading = useTripStore((state) => state.isLoading)
  const loadTripsFromStorage = useTripStore((state) => state.loadTripsFromStorage)
  const loadTripById = useTripStore((state) => state.loadTripById)
  const selectedTripId = useUiStore((state) => state.selectedTripId)
  const setSelectedTripId = useUiStore((state) => state.setSelectedTripId)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const [showArchived, setShowArchived] = useState(false)
  const deleteTripFromStorage = useTripStore((state) => state.deleteTripFromStorage)

  // Load trips from storage on mount
  useEffect(() => {
    loadTripsFromStorage()
  }, [loadTripsFromStorage])

  const filteredTrips = useMemo(() => trips
    .filter((trip) => {
      const matchesSearch =
        searchQuery === "" ||
        trip.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        trip.destination.toLowerCase().includes(searchQuery.toLowerCase())

      const isArchived = trip.status === "completed" || trip.status === "cancelled"
      const matchesFilter =
        filterStatus === "all"
          ? showArchived || !isArchived
          : trip.status === filterStatus

      return matchesSearch && matchesFilter
    })
    // Newest conversation first.
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [trips, searchQuery, filterStatus, showArchived])

  // A trip == a conversation. Opening one restores its full message history and
  // its plan into the chat so the user can keep talking and the plan updates.
  const handleTripClick = async (tripId: string) => {
    setSelectedTripId(tripId)
    const trip = await loadTripById(tripId) // sets currentTrip (with messages)
    if (trip) {
      const restored: ChatMessage[] =
        trip.messages && trip.messages.length > 0
          ? trip.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }))
          : [
              {
                id: `assistant-${trip.id}`,
                role: "assistant",
                content: trip.name,
                timestamp: new Date(),
                status: "completed",
                metadata: { tripId: trip.id },
              },
            ]
      useChatStore.getState().setMessages(restored)
      useChatStore.getState().setCurrentTripId(trip.id)
    }
    navigate("/")
  }

  return (
    <aside className="w-64 border-r bg-card flex flex-col transition-colors duration-300">
      <div className="p-3">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">{t("side.myTrips")}</h2>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("side.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border bg-background px-8 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Status filter */}
        <div className="flex gap-1 mt-2 flex-wrap">
          {(["all", "planning", "confirmed"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                filterStatus === status
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {status === "all" ? t("side.all") : t(`status.${status}`)}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {/* Loading state — only on the very first list load, so switching
              conversations never flashes a skeleton over an existing list. */}
          {isLoading && trips.length === 0 && (
            <div className="space-y-2 p-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2 p-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filteredTrips.length === 0 && (
            <motion.div
              className="flex flex-col items-center justify-center py-8 px-4 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Plane className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? t("side.noMatch") : t("side.noTrips")}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {searchQuery ? t("side.tryOther") : t("side.noTripsHint")}
              </p>
            </motion.div>
          )}

          {/* Trip list */}
          <AnimatePresence>
            {filteredTrips.map((trip) => {
              const isActive =
                selectedTripId === trip.id || location.pathname === `/trip/${trip.id}`

              return (
                // <motion.button
                //   key={trip.id}
                //   layout
                //   initial={{ opacity: 0, x: -10 }}
                //   animate={{ opacity: 1, x: 0 }}
                //   exit={{ opacity: 0, x: -10 }}
                //   onClick={() => handleTripClick(trip.id)}
                //   className={`w-full rounded-lg p-3 text-left transition-colors hover:bg-accent ${
                //     isActive ? "bg-accent ring-1 ring-primary/20" : ""
                //   }`}
                // >
                //   <div className="flex items-start justify-between">
                //     <div className="flex-1 min-w-0">
                //       <p className="truncate text-sm font-medium">{trip.name}</p>
                //       <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                //         <MapPin className="h-3 w-3 flex-shrink-0" />
                //         <span className="truncate">{trip.destination}</span>
                //       </div>
                //       <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                //         <Calendar className="h-3 w-3 flex-shrink-0" />
                //         <span>{trip.duration}{t("trip.daysUnit")}</span>
                //       </div>
                //     </div>
                //     <span className={`text-xs flex-shrink-0 ${TRIP_STATUS_COLORS[trip.status]}`}>
                //       {t(`status.${trip.status}`)}
                //     </span>
                //   </div>
                // </motion.button>

                <motion.button
  key={trip.id}
  layout
  initial={{ opacity: 0, x: -10 }}
  animate={{ opacity: 1, x: 0 }}
  exit={{ opacity: 0, x: -10 }}
  onClick={() => handleTripClick(trip.id)}
  className={`group w-full rounded-lg p-3 text-left transition-colors hover:bg-accent ${
    isActive ? "bg-accent ring-1 ring-primary/20" : ""
  }`}  // ← 加了 group
>
  <div className="flex items-start justify-between">
    <div className="flex-1 min-w-0">
      <p className="truncate text-sm font-medium">{trip.name}</p>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{trip.destination}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="h-3 w-3 flex-shrink-0" />
        <span>{trip.duration}{t("trip.daysUnit")}</span>
      </div>
    </div>

    <div className="flex flex-col items-end gap-1">
      <span className={`text-xs flex-shrink-0 ${TRIP_STATUS_COLORS[trip.status]}`}>
        {t(`status.${trip.status}`)}
      </span>
      {/* 删除按钮：hover 时才显示 */}
      <div
  role="button"
  onClick={(e) => {
    e.stopPropagation()
    deleteTripFromStorage(trip.id)
    if (location.pathname === `/trip/${trip.id}`) {
      navigate("/")
    }
  }}
  className="opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground transition-all cursor-pointer"
>
  <Trash2 className="h-3 w-3" />
</div>
    </div>
  </div>
</motion.button>
              )
            })}
          </AnimatePresence>
        </div>
      </ScrollArea>

      <Separator />
      <div className="p-3">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          size="sm"
          onClick={() => setShowArchived(!showArchived)}
        >
          <Archive className="mr-2 h-4 w-4" />
          {t("side.archived")}
          <ChevronDown
            className={`ml-auto h-4 w-4 transition-transform ${showArchived ? "rotate-180" : ""}`}
          />
        </Button>
      </div>
    </aside>
  )
}
