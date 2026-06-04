import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, Loader2, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { useT } from "@/i18n"

interface InputAreaProps {
  onSend: (content: string) => void
  onCancel?: () => void
  disabled?: boolean
}

export function InputArea({ onSend, onCancel, disabled }: InputAreaProps) {
  const { t } = useT()
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea when not disabled
  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [disabled])

  const handleSubmit = () => {
    const trimmedInput = input.trim()
    if (trimmedInput && !disabled) {
      setIsSending(true)
      onSend(trimmedInput)
      setInput("")
      // Brief animation feedback
      setTimeout(() => setIsSending(false), 200)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-end">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? t("chat.thinking") : t("chat.placeholder")}
          disabled={disabled}
          className={cn(
            "min-h-[60px] max-h-[200px] resize-y transition-opacity",
            disabled && "opacity-60"
          )}
          rows={1}
        />
        <div className="flex flex-col gap-1">
          {disabled && onCancel ? (
            <Button
              onClick={onCancel}
              size="icon"
              variant="destructive"
              className="h-[60px] w-[60px] shrink-0"
              title={t("chat.send")}
            >
              <Square className="h-5 w-5" />
            </Button>
          ) : (
            <motion.div
              animate={isSending ? { scale: [1, 0.9, 1] } : {}}
              transition={{ duration: 0.2 }}
            >
              <Button
                onClick={handleSubmit}
                size="icon"
                disabled={disabled || !input.trim()}
                className={cn(
                  "h-[60px] w-[60px] shrink-0 transition-all",
                  !input.trim() && "opacity-50"
                )}
                aria-label={t("chat.send")}
              >
                {disabled ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </motion.div>
          )}
        </div>
      </div>
      {/* Hint text */}
      <div className="flex justify-between px-1">
        <p className="text-xs text-muted-foreground/50">
          {t("chat.placeholder")}
        </p>
        {input.length > 0 && (
          <p className="text-xs text-muted-foreground/50">{input.length}</p>
        )}
      </div>
    </div>
  )
}
