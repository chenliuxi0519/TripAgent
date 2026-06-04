import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plane } from "lucide-react"
import { useAuthStore } from "@/stores/authStore"
import { useTripStore } from "@/stores/tripStore"
import { authLogin } from "@/services/backendApi"
import { resetPreferencesLocal, syncPreferencesFromServer } from "@/services/preferenceSync"
import { useT } from "@/i18n"

export default function LoginPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await authLogin(email, password)
      setAuth(res.access_token, res.user)
      // Drop the previous user's trips/preferences, then load this user's.
      useTripStore.getState().reset()
      resetPreferencesLocal()
      void syncPreferencesFromServer()
      navigate("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFail"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-3">
            <Plane className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">Trip Agent</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("auth.loginSubtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <Link to="/register" className="text-primary hover:underline font-medium">
            {t("auth.register")}
          </Link>
        </p>
      </Card>
    </div>
  )
}
