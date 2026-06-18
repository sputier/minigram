import { useEffect, useRef, useState } from 'react'
import type { MockChat, MockMessage } from '../data/mockData'

interface ChatViewProps {
  chat: MockChat | undefined
}

export default function ChatView({ chat }: ChatViewProps) {
  const [draft, setDraft] = useState('')
  const [localMessages, setLocalMessages] = useState<MockMessage[]>(chat?.messages ?? [])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocalMessages(chat?.messages ?? [])
  }, [chat])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [localMessages])

  if (!chat) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-tg-bg text-tg-muted">
        Sélectionne une discussion
      </div>
    )
  }

  function handleSend() {
    const text = draft.trim()
    if (!text) return
    setLocalMessages((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        text,
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        outgoing: true,
      },
    ])
    setDraft('')
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-tg-bg">
      <header className="flex items-center gap-3 border-b border-tg-border px-5 py-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full text-base font-medium text-white"
          style={{ backgroundColor: chat.color }}
        >
          {chat.initials}
        </div>
        <div>
          <div className="font-medium text-white">{chat.name}</div>
          <div className="text-xs text-tg-muted">en ligne</div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-2">
          {localMessages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.outgoing ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[60%] rounded-xl px-3 py-2 text-sm text-white shadow ${
                  message.outgoing
                    ? 'rounded-br-sm bg-tg-bubble-out'
                    : 'rounded-bl-sm bg-tg-bubble-in'
                }`}
              >
                <div>{message.text}</div>
                <div className="mt-1 text-right text-[10px] text-white/50">{message.time}</div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-tg-border px-5 py-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend()
          }}
          placeholder="Écrire un message"
          className="flex-1 rounded-full bg-tg-sidebar px-4 py-2 text-sm text-white placeholder-tg-muted outline-none"
        />
        <button
          onClick={handleSend}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-tg-accent text-white"
          aria-label="Envoyer"
        >
          ➤
        </button>
      </div>
    </div>
  )
}
