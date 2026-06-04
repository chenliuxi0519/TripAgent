/**
 * User Dashboard - Main component integrating all user-related features
 */

import { useEffect, useState, useMemo } from "react"
import { useSessionStore } from "@/stores/sessionStore"
import { OnboardingFlow } from "./OnboardingFlow"
import { ProfilePanel } from "./ProfilePanel"
import { PrivacySettings } from "./PrivacySettings"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { User, Sparkles, Shield, X } from "lucide-react"
import { useT } from "@/i18n"

type TabValue = "profile" | "privacy"

interface UserDashboardProps {
  onClose?: () => void
  className?: string
}

export function UserDashboard({ onClose, className }: UserDashboardProps) {
  const { t } = useT()
  const { session, isInitialized, initializeSession } = useSessionStore()
  const [activeTab, setActiveTab] = useState<TabValue>("profile")

  useEffect(() => {
    if (!isInitialized) {
      initializeSession()
    }
  }, [isInitialized, initializeSession])

  const maturityScore = useMemo(() => Math.round(
    (session.preferences.interests.length > 0 ? 0.2 : 0) +
    (session.preferences.budget ? 0.2 : 0) +
    (session.preferences.accommodationType?.length ? 0.2 : 0) +
    (session.favoriteDestinations.length > 0 ? 0.2 : 0) +
    (session.conversationHistory.length > 5 ? 0.2 : 0)
  ) * 100, [session.preferences, session.favoriteDestinations, session.conversationHistory])

  // Show onboarding if not completed
  if (!session.onboardingCompleted) {
    return (
      <div className={className}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">{t("dash.welcomeTitle")}</h2>
            <p className="text-muted-foreground">{t("dash.welcomeSub")}</p>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
        <OnboardingFlow onComplete={() => setActiveTab("profile")} />
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <User className="w-6 h-6" />
            {t("dash.assistant")}
          </h2>
          <p className="text-muted-foreground">
            {t("dash.personalized", { n: maturityScore })}
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      {maturityScore < 50 && (
        <Card className="p-4 mb-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {t("dash.completeProfile")}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                {t("dash.completeHint")}
              </p>
              <Button
                variant="link"
                className="p-0 h-auto text-blue-700 dark:text-blue-300"
                onClick={() => setActiveTab("profile")}
              >
                {t("dash.goSettings")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">{t("dash.tab.profile")}</span>
          </TabsTrigger>
          <TabsTrigger value="privacy" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">{t("dash.tab.privacy")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfilePanel />
        </TabsContent>

        <TabsContent value="privacy" className="mt-4">
          <PrivacySettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * Compact User Menu - For use in sidebar or header
 */
interface UserMenuProps {
  onOpenDashboard?: () => void
  className?: string
}

export function UserMenu({ onOpenDashboard, className }: UserMenuProps) {
  const { t } = useT()
  const { session } = useSessionStore()

  return (
    <div className={className}>
      <Button
        variant="ghost"
        className="justify-start w-full"
        onClick={onOpenDashboard}
      >
        <User className="w-4 h-4 mr-2" />
        {t("dash.assistant")}
        {session.favoriteDestinations.length > 0 && (
          <Badge variant="secondary" className="ml-auto">
            {session.favoriteDestinations.length}
          </Badge>
        )}
      </Button>
    </div>
  )
}
