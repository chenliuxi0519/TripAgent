import { useMemo } from "react"
import { MessageBubble } from "./MessageBubble"
import { useTripStore } from "@/stores/tripStore"
import { useT } from "@/i18n"
import type { ChatMessage } from "@/types"

interface MessageListProps {
  messages: ChatMessage[]
}

export function MessageList({ messages }: MessageListProps) {
  const { t } = useT()
  const currentTrip = useTripStore((state) => state.currentTrip)

  // A conversation reuses one trip id across turns, so several assistant
  // messages can share it. Show the (single) plan card only under the most
  // recent message for the active trip, so it stays in sync without duplicating.
  const anchorMessageId = useMemo(() => {
    if (!currentTrip) return null
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].metadata?.tripId === currentTrip.id) return messages[i].id
    }
    return null
  }, [messages, currentTrip])

  // The initial greeting is a persisted constant; render it reactively in the
  // active language by rebuilding its content from i18n at display time.
  const localizedWelcome = () =>
    `${t("welcome.greeting")}\n\n- **${t("welcome.l1")}**\n- **${t("welcome.l2")}**` +
    `\n- **${t("welcome.l3")}**\n- **${t("welcome.l4")}**\n\n${t("welcome.cta")}`

  return (
    <div className="space-y-6">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          isActiveTripAnchor={message.id === anchorMessageId}
          message={
            message.id === "welcome"
              ? { ...message, content: localizedWelcome() }
              : message
          }
        />
      ))}
    </div>
  )
}
