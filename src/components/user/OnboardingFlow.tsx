import { useState } from "react"
import { useSessionStore } from "@/stores/sessionStore"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, ChevronLeft, Check, Sparkles } from "lucide-react"
import { useT } from "@/i18n"
import { INTEREST_KEYS, ACCOMMODATION_OPTIONS, TRANSPORT_OPTIONS } from "@/constants/preferenceOptions"

const ONBOARDING_STEPS = [
  { id: "interests", icon: "🎯" },
  { id: "budget", icon: "💰" },
  { id: "accommodation", icon: "🏨" },
  { id: "transportation", icon: "🚗" },
]

interface OnboardingFlowProps {
  onComplete?: () => void
  className?: string
}

export function OnboardingFlow({ onComplete, className }: OnboardingFlowProps) {
  const { t } = useT()
  const { updatePreferences, completeOnboarding } = useSessionStore()
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState({
    interests: [] as string[],
    budgetMin: "",
    budgetMax: "",
    accommodation: [] as string[],
    transportation: [] as string[],
  })

  const currentStepData = ONBOARDING_STEPS[currentStep]

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = () => {
    // Save all preferences
    updatePreferences({
      interests: formData.interests,
      budget:
        formData.budgetMin && formData.budgetMax
          ? {
              min: parseInt(formData.budgetMin),
              max: parseInt(formData.budgetMax),
              currency: "CNY",
            }
          : undefined,
      accommodationType: formData.accommodation.length > 0 ? (formData.accommodation as any) : undefined,
      transportationPreference: formData.transportation.length > 0 ? (formData.transportation as any) : undefined,
    })

    completeOnboarding()
    onComplete?.()
  }

  const toggleInterest = (interest: string) => {
    setFormData((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }))
  }

  const toggleAccommodation = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      accommodation: prev.accommodation.includes(value)
        ? prev.accommodation.filter((v) => v !== value)
        : [...prev.accommodation, value],
    }))
  }

  const toggleTransport = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      transportation: prev.transportation.includes(value)
        ? prev.transportation.filter((v) => v !== value)
        : [...prev.transportation, value],
    }))
  }

  const canProceed = () => {
    switch (currentStepData.id) {
      case "interests":
        return formData.interests.length > 0
      case "budget":
        return true // Optional
      case "accommodation":
        return formData.accommodation.length > 0
      case "transportation":
        return formData.transportation.length > 0
      default:
        return true
    }
  }

  const renderStepContent = () => {
    switch (currentStepData.id) {
      case "interests":
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {INTEREST_KEYS.map((interest) => (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  className={`
                    px-4 py-2 rounded-full text-sm font-medium transition-all
                    ${formData.interests.includes(interest)
                      ? "bg-primary text-primary-foreground scale-105"
                      : "bg-muted hover:bg-muted/80"
                    }
                  `}
                >
                  {formData.interests.includes(interest) && (
                    <Check className="w-3 h-3 inline mr-1" />
                  )}
                  {t(`interest.${interest}`)}
                </button>
              ))}
            </div>
            {formData.interests.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("onb.pickOne")}</p>
            )}
          </div>
        )

      case "budget":
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("onb.budgetHint")}
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm text-muted-foreground">{t("onb.budgetMin")}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    ¥
                  </span>
                  <Input
                    type="number"
                    placeholder="500"
                    value={formData.budgetMin}
                    onChange={(e) => setFormData({ ...formData, budgetMin: e.target.value })}
                    className="pl-8"
                  />
                </div>
              </div>
              <span className="text-muted-foreground pt-6">-</span>
              <div className="flex-1">
                <label className="text-sm text-muted-foreground">{t("onb.budgetMax")}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    ¥
                  </span>
                  <Input
                    type="number"
                    placeholder="10000"
                    value={formData.budgetMax}
                    onChange={(e) => setFormData({ ...formData, budgetMax: e.target.value })}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormData({ ...formData, budgetMin: "500", budgetMax: "2000" })}
              >
                {t("onb.budgetEco")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormData({ ...formData, budgetMin: "2000", budgetMax: "5000" })}
              >
                {t("onb.budgetComfort")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormData({ ...formData, budgetMin: "5000", budgetMax: "15000" })}
              >
                {t("onb.budgetLux")}
              </Button>
            </div>
          </div>
        )

      case "accommodation":
        return (
          <div className="space-y-3">
            {ACCOMMODATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => toggleAccommodation(option.value)}
                className={`
                  w-full p-4 rounded-xl border-2 text-left transition-all
                  ${formData.accommodation.includes(option.value)
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{option.icon}</span>
                    <div>
                      <div className="font-medium">{t(`acc.${option.value}`)}</div>
                      <div className="text-sm text-muted-foreground">{t(`acc.${option.value}.desc`)}</div>
                    </div>
                  </div>
                  {formData.accommodation.includes(option.value) && (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )

      case "transportation":
        return (
          <div className="grid grid-cols-2 gap-3">
            {TRANSPORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => toggleTransport(option.value)}
                className={`
                  p-4 rounded-xl border-2 text-center transition-all
                  ${formData.transportation.includes(option.value)
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                  }
                `}
              >
                <div className="text-3xl mb-2">{option.icon}</div>
                <div className="font-medium text-sm">{t(`trans.${option.value}`)}</div>
                {formData.transportation.includes(option.value) && (
                  <Check className="w-4 h-4 text-primary mx-auto mt-2" />
                )}
              </button>
            ))}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className={className}>
      <Card className="p-8 max-w-lg mx-auto">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {ONBOARDING_STEPS.map((step, index) => (
            <button
              key={step.id}
              onClick={() => index <= currentStep && setCurrentStep(index)}
              className={`
                w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all
                ${index < currentStep
                  ? "bg-primary text-primary-foreground"
                  : index === currentStep
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                  : "bg-muted text-muted-foreground"
                }
              `}
              disabled={index > currentStep}
            >
              {index < currentStep ? <Check className="w-4 h-4" /> : index + 1}
            </button>
          ))}
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">{currentStepData.icon}</div>
          <h2 className="text-2xl font-bold mb-2">{t(`onb.${currentStepData.id}.title`)}</h2>
          <p className="text-muted-foreground">{t(`onb.${currentStepData.id}.desc`)}</p>
        </div>

        {/* Content */}
        <div className="mb-8">
          {renderStepContent()}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {currentStep > 0 ? (
            <Button variant="outline" onClick={handlePrevious} className="flex-1">
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t("onb.prev")}
            </Button>
          ) : (
            <div className="flex-1" />
          )}

          <Button
            onClick={handleNext}
            className="flex-1"
            disabled={!canProceed()}
          >
            {currentStep === ONBOARDING_STEPS.length - 1 ? (
              <>
                <Sparkles className="w-4 h-4 mr-1" />
                {t("onb.start")}
              </>
            ) : (
              <>
                {t("onb.next")}
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>

        {/* Skip link */}
        {currentStep < ONBOARDING_STEPS.length - 1 && (
          <button
            onClick={handleComplete}
            className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("onb.skip")}
          </button>
        )}
      </Card>
    </div>
  )
}

interface QuickTemplateCardProps {
  name: string
  description: string
  destination: string
  days: number
  estimatedBudget: number
  interests: string[]
  onSelect: () => void
}

export function QuickTemplateCard({
  name,
  description,
  destination,
  days,
  estimatedBudget,
  interests,
  onSelect,
}: QuickTemplateCardProps) {
  const { t } = useT()
  return (
    <Card
      className="p-4 hover:border-primary transition-colors cursor-pointer group"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold group-hover:text-primary transition-colors">{name}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="secondary">{days}{t("trip.daysUnit")}</Badge>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
        <span className="flex items-center gap-1">
          📍 {destination}
        </span>
        <span className="flex items-center gap-1">
          💰 ¥{estimatedBudget}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {interests.slice(0, 3).map((interest) => (
          <Badge key={interest} variant="outline" className="text-xs">
            {interest}
          </Badge>
        ))}
      </div>
    </Card>
  )
}
