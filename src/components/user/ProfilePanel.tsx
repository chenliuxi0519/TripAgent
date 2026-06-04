import { useState, useEffect } from "react"
import { useSessionStore } from "@/stores/sessionStore"
import type { UserPreferences, BehaviorAnalytics } from "@/types"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  User,
  Settings,
  Download,
  Trash2,
  Heart,
  Wallet,
  Home,
  Car,
  Utensils,
  Activity,
  Check,
} from "lucide-react"
import { useT } from "@/i18n"
import { INTEREST_KEYS, ACCOMMODATION_OPTIONS, TRANSPORT_OPTIONS } from "@/constants/preferenceOptions"

interface ProfilePanelProps {
  className?: string
}

export function ProfilePanel({ className }: ProfilePanelProps) {
  const { t } = useT()
  const { session, updatePreferences, exportData, clearData, getBehaviorAnalytics } = useSessionStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editedPrefs, setEditedPrefs] = useState<UserPreferences>(session.preferences)
  // Dietary restrictions are edited as free text (kept raw so spaces inside a
  // value like "no spicy food" aren't stripped on every keystroke); parsed into
  // a list only on save.
  const [dietaryText, setDietaryText] = useState("")
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [analytics, setAnalytics] = useState<BehaviorAnalytics | null>(null)

  useEffect(() => {
    setAnalytics(getBehaviorAnalytics())
  }, [session, getBehaviorAnalytics])

  const startEditing = () => {
    setEditedPrefs(session.preferences)
    setDietaryText((session.preferences.dietaryRestrictions ?? []).join(", "))
    setIsEditing(true)
  }

  const handleSavePreferences = () => {
    updatePreferences({
      ...editedPrefs,
      dietaryRestrictions: dietaryText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    })
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditedPrefs(session.preferences)
    setIsEditing(false)
  }

  const toggleInterest = (interest: string) => {
    setEditedPrefs((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }))
  }

  const toggleAccommodation = (type: "budget" | "mid-range" | "luxury") => {
    setEditedPrefs((prev) => ({
      ...prev,
      accommodationType: prev.accommodationType?.includes(type)
        ? prev.accommodationType.filter((t) => t !== type)
        : [...(prev.accommodationType || []), type],
    }))
  }

  const toggleTransport = (type: "public" | "rental" | "walking" | "taxi") => {
    setEditedPrefs((prev) => ({
      ...prev,
      transportationPreference: prev.transportationPreference?.includes(type)
        ? prev.transportationPreference.filter((t) => t !== type)
        : [...(prev.transportationPreference || []), type],
    }))
  }

  const handleExport = () => {
    const data = exportData()
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `trip-agent-data-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportDialog(false)
  }

  const handleClearData = () => {
    clearData()
    setShowDeleteDialog(false)
  }

  // Stored interests may be canonical keys (new) or legacy free text; show a
  // localized label when it's a known key, otherwise the raw value.
  const showInterest = (i: string) =>
    (INTEREST_KEYS as readonly string[]).includes(i) ? t(`interest.${i}`) : i

  const maturityScore = analytics
    ? Math.round(
        (analytics.topInterests.length > 0 ? 0.2 : 0) +
        (analytics.preferredDestinations.length > 0 ? 0.2 : 0) +
        (analytics.totalTripsPlanned > 0 ? 0.2 : 0) +
        (session.preferences.budget ? 0.2 : 0) +
        (session.preferences.accommodationType?.length ? 0.1 : 0) +
        (session.preferences.transportationPreference?.length ? 0.1 : 0)
      ) * 100
    : 0

  return (
    <div className={className}>
      <Card className="p-6 h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{t("prof.title")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("prof.maturity", { n: maturityScore })}
              </p>
            </div>
          </div>
          {!isEditing && (
            <Button variant="ghost" size="icon" onClick={startEditing}>
              <Settings className="w-5 h-5" />
            </Button>
          )}
        </div>

        <ScrollArea className="h-[calc(100vh-240px)]">
          {/* Analytics Summary */}
          {analytics && (
            <div className="mb-6 p-4 bg-muted/50 rounded-lg">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                {t("prof.analytics")}
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("prof.tripsPlanned")}</span>
                  <span className="ml-2 font-medium">{t("prof.timesUnit", { n: analytics.totalTripsPlanned })}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("prof.avgDays")}</span>
                  <span className="ml-2 font-medium">{analytics.averageTripDuration}{t("trip.daysUnit")}</span>
                </div>
              </div>
            </div>
          )}

          {/* Current Preferences Display */}
          {!isEditing ? (
            <div className="space-y-6">
              {/* Interests */}
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-500" />
                  {t("prof.interests")}
                </h3>
                {session.preferences.interests.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {session.preferences.interests.map((interest) => (
                      <Badge key={interest} variant="secondary">
                        {showInterest(interest)}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("prof.noInterests")}</p>
                )}
              </div>

              <Separator />

              {/* Budget */}
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-green-500" />
                  {t("prof.budget")}
                </h3>
                {session.preferences.budget ? (
                  <p className="text-sm">
                    ¥{session.preferences.budget.min} - ¥{session.preferences.budget.max}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("prof.noBudget")}</p>
                )}
              </div>

              <Separator />

              {/* Accommodation */}
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Home className="w-4 h-4 text-blue-500" />
                  {t("prof.accommodation")}
                </h3>
                {session.preferences.accommodationType && session.preferences.accommodationType.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {session.preferences.accommodationType.map((type) => {
                      const option = ACCOMMODATION_OPTIONS.find((o) => o.value === type)
                      return (
                        <Badge key={type} variant="outline">
                          {option?.icon} {t(`acc.${type}`)}
                        </Badge>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("prof.noAccommodation")}</p>
                )}
              </div>

              <Separator />

              {/* Transportation */}
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Car className="w-4 h-4 text-yellow-500" />
                  {t("prof.transport")}
                </h3>
                {session.preferences.transportationPreference && session.preferences.transportationPreference.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {session.preferences.transportationPreference.map((type) => {
                      const option = TRANSPORT_OPTIONS.find((o) => o.value === type)
                      return (
                        <Badge key={type} variant="outline">
                          {option?.icon} {t(`trans.${type}`)}
                        </Badge>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("prof.noTransport")}</p>
                )}
              </div>

              <Separator />

              {/* Dietary restrictions */}
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-orange-500" />
                  {t("prof.dietary")}
                </h3>
                {session.preferences.dietaryRestrictions && session.preferences.dietaryRestrictions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {session.preferences.dietaryRestrictions.map((item) => (
                      <Badge key={item} variant="secondary">
                        {item}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("prof.noDietary")}</p>
                )}
              </div>

              <Separator />

              {/* Data Management */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t("prof.dataMgmt")}</h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setShowExportDialog(true)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {t("prof.exportData")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-destructive hover:text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t("prof.clearData")}
                </Button>
              </div>
            </div>
          ) : (
            /* Edit Mode */
            <div className="space-y-6">
              

              {/* Interests */}
              <div>
                <h3 className="text-sm font-medium mb-3">{t("prof.selectInterests")}</h3>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_KEYS.map((interest) => (
                    <button
                      key={interest}
                      onClick={() => toggleInterest(interest)}
                      className={`
                        px-3 py-1.5 rounded-full text-sm transition-all
                        ${editedPrefs.interests.includes(interest)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80"
                        }
                      `}
                    >
                      {editedPrefs.interests.includes(interest) && (
                        <Check className="w-3 h-3 inline mr-1" />
                      )}
                      {t(`interest.${interest}`)}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Budget */}
              <div>
                <h3 className="text-sm font-medium mb-3">{t("prof.budgetRange")}</h3>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">{t("prof.min")}</label>
                    <Input
                      type="number"
                      value={editedPrefs.budget?.min || ""}
                      onChange={(e) =>
                        setEditedPrefs((prev) => ({
                          ...prev,
                          budget: { ...prev.budget, min: parseInt(e.target.value) || 0, max: prev.budget?.max || 10000, currency: "CNY" },
                        }))
                      }
                      placeholder="500"
                    />
                  </div>
                  <span className="text-muted-foreground">-</span>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">{t("prof.max")}</label>
                    <Input
                      type="number"
                      value={editedPrefs.budget?.max || ""}
                      onChange={(e) =>
                        setEditedPrefs((prev) => ({
                          ...prev,
                          budget: { ...prev.budget, min: prev.budget?.min || 500, max: parseInt(e.target.value) || 10000, currency: "CNY" },
                        }))
                      }
                      placeholder="10000"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Accommodation */}
              <div>
                <h3 className="text-sm font-medium mb-3">{t("prof.accType")}</h3>
                <div className="space-y-2">
                  {ACCOMMODATION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => toggleAccommodation(option.value as any)}
                      className={`
                        w-full p-3 rounded-lg border-2 text-left transition-all
                        ${editedPrefs.accommodationType?.includes(option.value as any)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/50"
                        }
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{option.icon}</span>
                          <div>
                            <div className="font-medium text-sm">{t(`acc.${option.value}`)}</div>
                            <div className="text-xs text-muted-foreground">{t(`acc.${option.value}.desc`)}</div>
                          </div>
                        </div>
                        {editedPrefs.accommodationType?.includes(option.value as any) && (
                          <Check className="w-5 h-5 text-primary" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Transportation */}
              <div>
                <h3 className="text-sm font-medium mb-3">{t("prof.transType")}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {TRANSPORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => toggleTransport(option.value as any)}
                      className={`
                        p-3 rounded-lg border-2 text-center transition-all
                        ${editedPrefs.transportationPreference?.includes(option.value as any)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/50"
                        }
                      `}
                    >
                      <div className="text-2xl mb-1">{option.icon}</div>
                      <div className="text-xs font-medium">{t(`trans.${option.value}`)}</div>
                      {editedPrefs.transportationPreference?.includes(option.value as any) && (
                        <Check className="w-4 h-4 text-primary mx-auto mt-1" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Dietary Restrictions */}
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Utensils className="w-4 h-4" />
                  {t("prof.dietary")}
                </h3>
                <Input
                  type="text"
                  placeholder={t("prof.dietaryPlaceholder")}
                  value={dietaryText}
                  onChange={(e) => setDietaryText(e.target.value)}
                />
              </div>

              <div className="flex justify-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                  {t("prof.cancel")}
                </Button>
                <Button size="sm" onClick={handleSavePreferences}>
                  <Check className="w-4 h-4 mr-1" />
                  {t("prof.save")}
                </Button>
              </div>
            </div>
            
          )}
        </ScrollArea>
      </Card>

      {/* Export Dialog */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6 w-96">
            <h3 className="text-lg font-semibold mb-2">{t("prof.exportTitle")}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("prof.exportDesc")}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowExportDialog(false)}>
                {t("prof.cancel")}
              </Button>
              <Button className="flex-1" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                {t("prof.export")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Delete Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6 w-96">
            <h3 className="text-lg font-semibold mb-2 text-destructive">{t("prof.clearTitle")}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("prof.clearDesc")}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDeleteDialog(false)}>
                {t("prof.cancel")}
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleClearData}>
                <Trash2 className="w-4 h-4 mr-2" />
                {t("prof.confirmDelete")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
