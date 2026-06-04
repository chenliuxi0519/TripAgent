import { useState } from "react"
import { useSessionStore } from "@/stores/sessionStore"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Shield, Eye, EyeOff, Download, Trash2, AlertTriangle } from "lucide-react"
import { useT } from "@/i18n"

interface PrivacySettingsProps {
  className?: string
}

export function PrivacySettings({ className }: PrivacySettingsProps) {
  const { t } = useT()
  const { session, exportData, clearData } = useSessionStore()
  const [showDataPreview, setShowDataPreview] = useState(false)

  const handleExport = () => {
    const data = exportData()
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `trip-agent-data-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClear = () => {
    if (confirm(t("priv.clearConfirm"))) {
      clearData()
    }
  }

  // Calculate what data is stored
  const dataSummary = {
    preferences: Object.keys(session.preferences).filter(
      (key) => {
        const value = session.preferences[key as keyof typeof session.preferences]
        return value !== undefined && value !== null && (Array.isArray(value) ? value.length > 0 : true)
      }
    ).length,
    conversations: session.conversationHistory.length,
    destinations: session.destinationInteractions.length,
    feedback: session.feedback.length,
    favorites: session.favoriteDestinations.length,
  }

  const totalDataPoints = Object.values(dataSummary).reduce((a, b) => a + b, 0)

  return (
    <div className={className}>
      <Card className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{t("priv.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("priv.subtitle")}</p>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-6">
            {/* Data Summary */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                {t("priv.dataOverview")}
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("priv.preferences")}</span>
                  <span className="font-medium">{t("priv.itemsUnit", { n: dataSummary.preferences })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("priv.conversations")}</span>
                  <span className="font-medium">{t("priv.convUnit", { n: dataSummary.conversations })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("priv.browsing")}</span>
                  <span className="font-medium">{t("priv.countUnit", { n: dataSummary.destinations })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("priv.feedback")}</span>
                  <span className="font-medium">{t("priv.convUnit", { n: dataSummary.feedback })}</span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span className="text-muted-foreground">{t("priv.favorites")}</span>
                  <span className="font-medium">{t("priv.countUnit", { n: dataSummary.favorites })}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("priv.total")}</span>
                  <span className="font-medium">{t("priv.itemsUnit", { n: totalDataPoints })}</span>
                </div>
              </div>
            </div>

            {/* Privacy Notice */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                {t("priv.howWeUse")}
              </h3>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <li>{t("priv.use1")}</li>
                <li>{t("priv.use2")}</li>
                <li>{t("priv.use3")}</li>
                <li>{t("priv.use4")}</li>
              </ul>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                {t("priv.localOnly")}
              </p>
            </div>

            {/* Data Storage Location */}
            <div className="p-4 border rounded-lg">
              <h3 className="text-sm font-medium mb-2">{t("priv.storageLoc")}</h3>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>{t("priv.storageWeb")}</p>
                <p>{t("priv.storageDesktop")}</p>
              </div>
              <div className="mt-3 p-2 bg-muted rounded text-xs font-mono">
                ~/trip-agent/session-data.json
              </div>
            </div>

            {/* Data Preview */}
            <div>
              <button
                onClick={() => setShowDataPreview(!showDataPreview)}
                className="w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-2">
                    {showDataPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {t("priv.viewRaw")}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {showDataPreview ? t("priv.hide") : t("priv.show")}
                  </Badge>
                </div>
              </button>

              {showDataPreview && (
                <div className="mt-2 p-3 bg-muted rounded-lg">
                  <pre className="text-xs overflow-auto max-h-64">
                    {JSON.stringify(
                      {
                        preferences: session.preferences,
                        favoriteDestinations: session.favoriteDestinations,
                        conversationCount: session.conversationHistory.length,
                        interactionCount: session.destinationInteractions.length,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
            </div>

            {/* GDPR Rights */}
            <div className="p-4 border rounded-lg">
              <h3 className="text-sm font-medium mb-3">{t("priv.rights")}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Download className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="font-medium">{t("priv.rightExport")}</div>
                    <div className="text-muted-foreground text-xs">
                      {t("priv.rightExportDesc")}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Trash2 className="w-3 h-3 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <div className="font-medium">{t("priv.rightDelete")}</div>
                    <div className="text-muted-foreground text-xs">
                      {t("priv.rightDeleteDesc")}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Eye className="w-3 h-3 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <div className="font-medium">{t("priv.rightAccess")}</div>
                    <div className="text-muted-foreground text-xs">
                      {t("priv.rightAccessDesc")}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-4 border-t">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleExport}
              >
                <Download className="w-4 h-4 mr-2" />
                {t("priv.exportBtn")}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start text-destructive hover:text-destructive"
                onClick={handleClear}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t("priv.deleteBtn")}
              </Button>
            </div>

            {/* Warning Notice */}
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg flex gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
              <div className="text-sm text-yellow-700 dark:text-yellow-300">
                <strong>{t("priv.importantLabel")}</strong>
                {t("priv.warning")}
              </div>
            </div>
          </div>
        </ScrollArea>
      </Card>
    </div>
  )
}
