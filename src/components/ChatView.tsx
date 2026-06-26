import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { UiChat, UiMediaRef, UiMessage } from '../types/telegram'

interface ChatViewProps {
  chat: UiChat | undefined
  messages: UiMessage[]
  onSend: (text: string) => void
  emptyMessage: string
  onLoadMore: () => void
  hasMore: boolean
  loadingMore: boolean
  mediaVersion: number
}

const LOAD_MORE_THRESHOLD_PX = 80

function MediaBubbleContent({ media, version }: { media: UiMediaRef; version: number }) {
  const [failed, setFailed] = useState(false)
  const src = `minigram-media://media?id=${media.fileId}&v=${version}`

  useEffect(() => setFailed(false), [version, media.fileId])

  if (failed) {
    return <div className="text-xs italic text-white/60">Téléchargement du média en cours…</div>
  }

  switch (media.kind) {
    case 'photo':
    case 'sticker':
      return (
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          className="max-h-72 max-w-full rounded-lg object-contain"
        />
      )
    case 'video':
    case 'animation':
      return (
        <video
          src={src}
          onError={() => setFailed(true)}
          controls={media.kind === 'video'}
          autoPlay={media.kind === 'animation'}
          loop={media.kind === 'animation'}
          muted={media.kind === 'animation'}
          className="max-h-72 max-w-full rounded-lg"
        />
      )
    case 'voice':
      return <audio src={src} controls onError={() => setFailed(true)} className="max-w-full" />
    case 'document':
      return (
        <a
          href={src}
          download={media.fileName}
          className="flex items-center gap-2 text-sm text-tg-accent underline"
        >
          📄 {media.fileName ?? 'Document'}
        </a>
      )
    default:
      return null
  }
}

export default function ChatView({
  chat,
  messages,
  onSend,
  emptyMessage,
  onLoadMore,
  hasMore,
  loadingMore,
  mediaVersion,
}: ChatViewProps) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef<number | null>(null)
  const prevLastIdRef = useRef<number | null>(null)

  function handleScroll() {
    const el = scrollRef.current
    if (!el || !hasMore || loadingMore) return
    if (el.scrollTop < LOAD_MORE_THRESHOLD_PX) {
      prevScrollHeightRef.current = el.scrollHeight
      onLoadMore()
    }
  }

  // Remonter dans l'historique (scroll-up) ne doit pas faire défiler vers le
  // bas comme un nouveau message : on ajuste scrollTop du delta de hauteur
  // ajoutée pour garder la position visuelle stable, plutôt que de
  // re-scroller en bas à chaque chargement de messages plus anciens.
  useLayoutEffect(() => {
    const el = scrollRef.current
    const lastId = messages.at(-1)?.id ?? null

    if (prevScrollHeightRef.current !== null && el) {
      el.scrollTop += el.scrollHeight - prevScrollHeightRef.current
      prevScrollHeightRef.current = null
    } else if (lastId !== prevLastIdRef.current) {
      bottomRef.current?.scrollIntoView({ block: 'end' })
    }

    prevLastIdRef.current = lastId
  }, [messages])

  useEffect(() => {
    prevScrollHeightRef.current = null
  }, [chat?.id])

  if (!chat) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-tg-bg text-center text-tg-muted">
        {emptyMessage}
      </div>
    )
  }

  function handleSend() {
    const text = draft.trim()
    if (!text) return
    onSend(text)
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
        </div>
      </header>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-2">
          {loadingMore && (
            <div className="py-2 text-center text-xs text-tg-muted">Chargement de l'historique…</div>
          )}
          {messages.map((message) => (
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
                {message.media && (
                  <div className="mb-1">
                    <MediaBubbleContent media={message.media} version={mediaVersion} />
                  </div>
                )}
                {message.text && <div>{message.text}</div>}
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
