/**
 * QuestionPanel - A2UI 主动提问界面组件
 *
 * 显示缺失信息问题，支持快速回复选项
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChevronLeft } from "lucide-react"
import type { Question, QuestionSequence } from "@/services/questionGenerator"
import { useT } from "@/i18n"
import { cn } from "@/lib/utils"

interface QuestionPanelProps {
  sequence: QuestionSequence
  onAnswer: (question: Question, answer: string) => void
  onSkip?: () => void
  onBack?: () => void
  isLoading?: boolean
  className?: string
}

const typeIcons: Record<Question["type"], string> = {
  text: "📝",
  choice: "📋",
  date: "📅",
  number: "🔢",
  "multi-choice": "☑️",
}

export function QuestionPanel({
  sequence,
  onAnswer,
  onSkip,
  onBack,
  isLoading = false,
  className,
}: QuestionPanelProps) {
  const { t } = useT()
  const [customAnswer, setCustomAnswer] = useState("")
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])

  const currentQuestion = sequence.questions[sequence.currentIndex]

  if (!currentQuestion) {
    return null
  }

  const isMultiSelect = currentQuestion.type === "multi-choice"

  const handleQuickReply = (reply: string) => {
    onAnswer(currentQuestion, reply)
    setCustomAnswer("")
    setSelectedOptions([])
  }

  const handleCustomSubmit = () => {
    const answer = isMultiSelect ? selectedOptions.join(", ") : customAnswer
    if (answer.trim()) {
      onAnswer(currentQuestion, answer)
      setCustomAnswer("")
      setSelectedOptions([])
    }
  }

  const handleOptionToggle = (option: string) => {
    if (isMultiSelect) {
      setSelectedOptions(prev =>
        prev.includes(option)
          ? prev.filter(o => o !== option)
          : [...prev, option]
      )
    } else {
      handleQuickReply(option)
    }
  }

  const progress = ((sequence.currentIndex + 1) / sequence.questions.length) * 100

  return (
    <Card
      className={cn(
        "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20",
        className
      )}
    >
      {/* Progress Bar */}
      <div className="h-1 w-full bg-blue-100 dark:bg-blue-900/50">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ScrollArea className="max-h-[400px] p-4">
        {/* Question Header */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{typeIcons[currentQuestion.type]}</span>
            <Badge
              variant="outline"
              className="border-blue-200 dark:border-blue-700 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
            >
              {t(`q.type.${currentQuestion.type}`)}
            </Badge>
            {currentQuestion.required && (
              <Badge variant="destructive" className="text-xs">
                {t("q.required")}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {sequence.currentIndex + 1} / {sequence.questions.length}
          </span>
        </div>

        {/* Question Text */}
        <h3 className="mb-4 text-lg font-semibold leading-relaxed">
          {currentQuestion.text}
        </h3>

        {/* Quick Replies */}
        {currentQuestion.quickReplies && currentQuestion.quickReplies.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-sm text-muted-foreground">{t("q.quickReplies")}</p>
            <div className="flex flex-wrap gap-2">
              {currentQuestion.quickReplies.map((reply, index) => {
                const isSelected = selectedOptions.includes(reply)
                return (
                  <Button
                    key={index}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleOptionToggle(reply)}
                    disabled={isLoading}
                    className={cn(
                      "transition-all",
                      isMultiSelect && isSelected && "bg-blue-600 hover:bg-blue-700"
                    )}
                  >
                    {reply}
                  </Button>
                )
              })}
            </div>
          </div>
        )}

        {/* Custom Input */}
        <div className="space-y-2">
          {currentQuestion.type === "text" || currentQuestion.type === "choice" ? (
            <Input
              value={customAnswer}
              onChange={e => setCustomAnswer(e.target.value)}
              placeholder={t("q.inputPlaceholder")}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleCustomSubmit()
                }
              }}
              disabled={isLoading}
              autoFocus
            />
          ) : currentQuestion.type === "multi-choice" ? (
            <Textarea
              value={selectedOptions.join(", ")}
              placeholder={t("q.multiPlaceholder")}
              readOnly
              disabled={isLoading}
              rows={2}
            />
          ) : null}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {sequence.currentIndex > 0 && onBack && (
              <Button
                onClick={onBack}
                variant="outline"
                size="sm"
                disabled={isLoading}
                title={t("q.back")}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("q.back")}
              </Button>
            )}
            <Button
              onClick={handleCustomSubmit}
              disabled={isLoading || (!customAnswer.trim() && selectedOptions.length === 0)}
              size="sm"
              className="flex-1"
            >
              {isLoading ? t("q.processing") : t("q.submit")}
            </Button>
            {!currentQuestion.required && onSkip && (
              <Button
                onClick={onSkip}
                variant="ghost"
                size="sm"
                disabled={isLoading}
              >
                {t("q.skip")}
              </Button>
            )}
          </div>
        </div>

        {/* Multi-select hint */}
        {isMultiSelect && selectedOptions.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("q.selectedCount", { n: selectedOptions.length })}
          </p>
        )}
      </ScrollArea>
    </Card>
  )
}
