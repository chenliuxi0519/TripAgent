import { useState } from "react"
import { useSessionStore } from "@/stores/sessionStore"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Heart, ThumbsDown, MessageSquare, X } from "lucide-react"
import { useT } from "@/i18n"

interface FeedbackButtonProps {
  tripId: string
  itemName: string
  recommendationType: "destination" | "hotel" | "restaurant" | "activity"
  onFeedbackGiven?: (feedback: "positive" | "negative" | "neutral") => void
  className?: string
}

export function FeedbackButton({
  tripId,
  itemName,
  recommendationType,
  onFeedbackGiven,
  className,
}: FeedbackButtonProps) {
  const { t } = useT()
  const { addFeedback, trackDestinationInteraction } = useSessionStore()
  const [showDialog, setShowDialog] = useState(false)
  const [feedbackType, setFeedbackType] = useState<"positive" | "negative" | "neutral" | null>(null)
  const [reason, setReason] = useState("")

  const handleFeedback = (type: "positive" | "negative" | "neutral") => {
    setFeedbackType(type)
    if (type !== "negative") {
      // For positive and neutral, submit immediately
      submitFeedback(type, "")
    } else {
      // For negative, show dialog for reason
      setShowDialog(true)
    }
  }

  const submitFeedback = (type: "positive" | "negative" | "neutral", reasonText: string) => {
    addFeedback({
      tripId,
      recommendationType,
      itemName,
      feedback: type,
      timestamp: new Date(),
      reason: reasonText || undefined,
    })

    // Track destination interaction
    if (recommendationType === "destination") {
      trackDestinationInteraction(itemName, type === "positive" ? "positive" : type === "negative" ? "negative" : undefined)
    }

    onFeedbackGiven?.(type)
    setShowDialog(false)
    setFeedbackType(null)
    setReason("")
  }

  const handleSubmitReason = () => {
    if (feedbackType) {
      submitFeedback(feedbackType, reason)
    }
  }

  return (
    <>
      <div className={`flex items-center gap-1 ${className}`}>
        <button
          onClick={() => handleFeedback("positive")}
          className="p-2 rounded-full hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors group"
          title={t("fb.like")}
        >
          <Heart className="w-4 h-4 text-gray-400 group-hover:text-green-500 transition-colors" />
        </button>
        <button
          onClick={() => handleFeedback("negative")}
          className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors group"
          title={t("fb.dislike")}
        >
          <ThumbsDown className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" />
        </button>
        <button
          onClick={() => handleFeedback("neutral")}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
          title={t("fb.neutral")}
        >
          <MessageSquare className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
        </button>
      </div>

      {/* Feedback Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t("fb.helpImprove")}</h3>
              <button
                onClick={() => setShowDialog(false)}
                className="p-1 hover:bg-muted rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              {t("fb.whyDislike", { name: itemName })}
            </p>

            <Textarea
              placeholder={t("fb.placeholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[100px] mb-4"
            />

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDialog(false)}>
                {t("fb.cancel")}
              </Button>
              <Button className="flex-1" onClick={handleSubmitReason}>
                {t("fb.submit")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

interface SaveDestinationButtonProps {
  destination: string
  className?: string
}

export function SaveDestinationButton({ destination, className }: SaveDestinationButtonProps) {
  const { t } = useT()
  const { session, saveDestination, unsaveDestination } = useSessionStore()
  const isSaved = session.favoriteDestinations.includes(destination)
  const [isAnimating, setIsAnimating] = useState(false)

  const handleToggleSave = () => {
    setIsAnimating(true)
    setTimeout(() => setIsAnimating(false), 300)

    if (isSaved) {
      unsaveDestination(destination)
    } else {
      saveDestination(destination)
    }
  }

  return (
    <button
      onClick={handleToggleSave}
      className={`
        p-2 rounded-full transition-all
        ${isSaved
          ? "bg-red-100 dark:bg-red-900/20"
          : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
        }
        ${isAnimating ? "scale-110" : "scale-100"}
        ${className}
      `}
      title={isSaved ? t("fb.unsave") : t("fb.save")}
    >
      <Heart
        className={`w-5 h-5 transition-all ${
          isSaved ? "text-red-500 fill-red-500" : "text-gray-500"
        }`}
      />
    </button>
  )
}
