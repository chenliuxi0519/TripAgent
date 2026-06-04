import { ApiKeySettings } from "@/components/settings"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useT } from "@/i18n"

export default function SettingsPage() {
  const navigate = useNavigate()
  const { t } = useT()

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("detail.back")}
          </Button>
        </div>
        <h1 className="text-2xl font-bold mb-6">{t("settings.title")}</h1>
        <div className="space-y-6">
          <section>
            <h2 className="text-lg font-semibold mb-4">{t("settings.apiKeys")}</h2>
            <ApiKeySettings />
          </section>
        </div>
      </div>
    </div>
  )
}
