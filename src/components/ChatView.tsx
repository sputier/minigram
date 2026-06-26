import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Avatar from './Avatar'
import type { UiChat, UiMediaRef, UiMessage, UiReaction, UiUserAvatar } from '../types/telegram'

function useSenderAvatars(messages: UiMessage[], isGroup: boolean) {
  const cacheRef = useRef<Map<number, UiUserAvatar>>(new Map())
  const [avatars, setAvatars] = useState<Map<number, UiUserAvatar>>(new Map())

  useEffect(() => {
    if (!isGroup) return
    const ids = [
      ...new Set(messages.filter((m) => !m.outgoing && m.senderId != null).map((m) => m.senderId!)),
    ]
    const missing = ids.filter((id) => !cacheRef.current.has(id))
    if (missing.length === 0) return
    window.minigram.getUserAvatars(missing).then((results) => {
      for (const a of results) cacheRef.current.set(a.userId, a)
      setAvatars(new Map(cacheRef.current))
    })
  }, [messages, isGroup]) // eslint-disable-line react-hooks/exhaustive-deps

  return avatars
}

function senderGroupInfo(messages: UiMessage[], index: number) {
  const msg = messages[index]
  if (msg.outgoing || !msg.senderId) return { isFirst: false, isLast: false }
  const prev = messages[index - 1]
  const next = messages[index + 1]
  return {
    isFirst: !prev || prev.outgoing || prev.senderId !== msg.senderId,
    isLast: !next || next.outgoing || next.senderId !== msg.senderId,
  }
}

interface ChatViewProps {
  chat: UiChat | undefined
  messages: UiMessage[]
  onSend: (text: string) => void
  emptyMessage: string
  onLoadMore: () => void
  hasMore: boolean
  loadingMore: boolean
  mediaVersion: number
  latestReadyPhotoFileId: number | null
}

const LOAD_MORE_THRESHOLD_PX = 80

interface LightboxProps {
  media: UiMediaRef
  src: string
  onClose: () => void
}

function Lightbox({ media, src, onClose }: LightboxProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20"
        onClick={onClose}
        aria-label="Fermer"
      >
        ✕
      </button>

      <div
        className="flex max-h-screen max-w-[90vw] items-center justify-center p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {(media.kind === 'photo' || media.kind === 'sticker') && (
          <img
            src={src}
            alt=""
            className="max-h-[90vh] max-w-[88vw] rounded-lg object-contain shadow-2xl"
          />
        )}
        {(media.kind === 'video' || media.kind === 'animation') && (
          <video
            src={src}
            controls={media.kind === 'video'}
            autoPlay
            loop={media.kind === 'animation'}
            muted={media.kind === 'animation'}
            className="max-h-[90vh] max-w-[88vw] rounded-lg shadow-2xl"
          />
        )}
      </div>
    </div>
  )
}

function UserAvatarMini({ avatar }: { avatar: UiUserAvatar }) {
  return (
    <Avatar
      photoFileId={avatar.photoFileId}
      initials={avatar.initials}
      color={avatar.color}
      className="-ml-1 h-[18px] w-[18px] text-[8px] font-bold ring-1 ring-tg-bg first:ml-0"
    />
  )
}

const QUICK_REACTIONS = ['👍', '👎', '❤️', '🔥', '😂', '🥰', '😱', '💯', '👏', '🎉']

function EmojiPicker({ message, onClose }: { message: UiMessage; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-20 mb-1 flex rounded-full bg-[#1e2c3a] px-2 py-1.5 shadow-xl ring-1 ring-white/10"
    >
      {QUICK_REACTIONS.map((emoji) => {
        const chosen = message.reactions?.find((r) => r.emoji === emoji)?.chosen ?? false
        return (
          <button
            key={emoji}
            title={chosen ? 'Retirer la réaction' : 'Réagir'}
            onClick={() => {
              if (chosen) window.minigram.removeReaction(message.chatId, message.id, emoji)
              else window.minigram.addReaction(message.chatId, message.id, emoji)
              onClose()
            }}
            className={`rounded-full px-0.5 text-xl leading-none transition-transform hover:scale-125 ${
              chosen ? 'ring-2 ring-tg-accent/70' : ''
            }`}
          >
            {emoji}
          </button>
        )
      })}
    </div>
  )
}

function ReactionPill({ reaction, chatId, messageId }: { reaction: UiReaction; chatId: number; messageId: number }) {
  const [avatars, setAvatars] = useState<UiUserAvatar[]>([])

  useEffect(() => {
    if (reaction.recentSenderIds.length === 0) return
    let cancelled = false
    window.minigram.getUserAvatars(reaction.recentSenderIds).then((result) => {
      if (!cancelled) setAvatars(result)
    })
    return () => { cancelled = true }
  }, [reaction.recentSenderIds.join(',')])

  function handleClick() {
    if (reaction.chosen) window.minigram.removeReaction(chatId, messageId, reaction.emoji)
    else window.minigram.addReaction(chatId, messageId, reaction.emoji)
  }

  return (
    <button
      onClick={handleClick}
      className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-opacity hover:opacity-80 active:scale-95 ${
        reaction.chosen
          ? 'bg-tg-accent/30 text-tg-accent ring-1 ring-tg-accent/50'
          : 'bg-white/10 text-white/80'
      }`}
    >
      <span>{reaction.emoji}</span>
      {avatars.length > 0 && (
        <span className="flex items-center">
          {avatars.map((a) => <UserAvatarMini key={a.userId} avatar={a} />)}
        </span>
      )}
      {reaction.count > 1 && <span className="font-medium">{reaction.count}</span>}
    </button>
  )
}

type MediaFailReason = 'pending' | 'unsupported'

function MediaBubbleContent({
  media,
  version,
  onOpenLightbox,
}: {
  media: UiMediaRef
  version: number
  onOpenLightbox: (media: UiMediaRef, src: string) => void
}) {
  const [failed, setFailed] = useState<MediaFailReason | null>(null)
  const src = `minigram-media://media?id=${media.fileId}&v=${version}`

  useEffect(() => setFailed(null), [version, media.fileId])

  if (failed) {
    const msg = failed === 'unsupported'
      ? 'Format vidéo non supporté par le lecteur intégré.'
      : 'Téléchargement du média en cours…'
    return <div className="text-xs italic text-white/60">{msg}</div>
  }

  const canLightbox = media.kind === 'photo' || media.kind === 'video' || media.kind === 'animation' || media.kind === 'sticker'

  switch (media.kind) {
    case 'photo':
    case 'sticker':
      return (
        <img
          src={src}
          alt=""
          onError={() => setFailed('pending')}
          onClick={canLightbox ? () => onOpenLightbox(media, src) : undefined}
          className={`max-h-72 max-w-full rounded-lg object-contain ${canLightbox ? 'cursor-zoom-in' : ''}`}
        />
      )
    case 'video':
    case 'animation':
      return (
        <div className={canLightbox ? 'relative cursor-zoom-in' : ''} onClick={canLightbox ? () => onOpenLightbox(media, src) : undefined}>
          <video
            src={src}
            onError={(e) => {
              const code = (e.target as HTMLVideoElement).error?.code
              // MEDIA_ERR_DECODE = 3, MEDIA_ERR_SRC_NOT_SUPPORTED = 4
              setFailed(code === 3 || code === 4 ? 'unsupported' : 'pending')
            }}
            controls={false}
            autoPlay={media.kind === 'animation'}
            loop={media.kind === 'animation'}
            muted
            className="max-h-72 max-w-full rounded-lg"
          />
          {media.kind === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-xl text-white">
                ▶
              </div>
            </div>
          )}
        </div>
      )
    case 'voice':
      return <audio src={src} controls onError={() => setFailed('pending')} className="max-w-full" />
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
  latestReadyPhotoFileId,
}: ChatViewProps) {
  const [draft, setDraft] = useState('')
  const [lightbox, setLightbox] = useState<{ media: UiMediaRef; src: string } | null>(null)
  const [pickerMsgId, setPickerMsgId] = useState<number | null>(null)
  const senderAvatars = useSenderAvatars(messages, chat?.isGroup ?? false)
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
    <>
      {lightbox && (
        <Lightbox
          media={lightbox.media}
          src={lightbox.src}
          onClose={() => setLightbox(null)}
        />
      )}

      <div className="flex h-full flex-1 flex-col bg-tg-bg">
        <header className="flex items-center gap-3 border-b border-tg-border px-5 py-3">
          <Avatar
            photoFileId={chat.photoFileId}
            initials={chat.initials}
            color={chat.color}
            className="h-10 w-10 text-base"
            latestReadyFileId={latestReadyPhotoFileId}
          />
          <div>
            <div className="font-medium text-white">{chat.name}</div>
          </div>
        </header>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-2">
            {loadingMore && (
              <div className="py-2 text-center text-xs text-tg-muted">Chargement de l'historique…</div>
            )}
            {messages.map((message, index) => {
              const isGroupChat = chat.isGroup
              const { isFirst, isLast } = isGroupChat ? senderGroupInfo(messages, index) : { isFirst: false, isLast: false }
              const sender = isGroupChat && message.senderId ? senderAvatars.get(message.senderId) : undefined

              const bubbleInner = (outgoing: boolean) => (
                <div
                  className={`rounded-xl px-3 py-2 text-sm text-white shadow ${
                    outgoing ? 'rounded-br-sm bg-tg-bubble-out' : 'rounded-bl-sm bg-tg-bubble-in'
                  }`}
                >
                  {message.media && (
                    <div className="mb-1">
                      <MediaBubbleContent
                        media={message.media}
                        version={mediaVersion}
                        onOpenLightbox={(m, s) => setLightbox({ media: m, src: s })}
                      />
                    </div>
                  )}
                  {message.text && <div>{message.text}</div>}
                  <div className="mt-1 text-right text-[10px] text-white/50">{message.time}</div>
                </div>
              )

              const reactionPills = (justify: 'justify-start' | 'justify-end') =>
                message.reactions && message.reactions.length > 0 ? (
                  <div className={`-mt-1 mb-1 flex flex-wrap gap-1 ${justify}`}>
                    {message.reactions.map((r) => (
                      <ReactionPill key={r.emoji} reaction={r} chatId={message.chatId} messageId={message.id} />
                    ))}
                  </div>
                ) : null

              const reactionBtn = (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setPickerMsgId((id) => (id === message.id ? null : message.id))}
                  className={`absolute top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-[#1e2c3a] text-sm text-white/50 shadow ring-1 ring-white/10 hover:text-white group-hover:flex ${
                    message.outgoing ? '-left-7' : '-right-7'
                  }`}
                  title="Ajouter une réaction"
                >
                  😊
                </button>
              )

              if (!message.outgoing && isGroupChat && message.senderId) {
                return (
                  <div key={message.id} className="flex flex-row items-start gap-2">
                    {isLast && sender ? (
                      <Avatar
                        photoFileId={sender.photoFileId}
                        initials={sender.initials}
                        color={sender.color}
                        className="h-8 w-8 flex-shrink-0 text-xs"
                      />
                    ) : (
                      <div className="h-8 w-8 flex-shrink-0" />
                    )}
                    <div className="flex max-w-[60%] flex-col items-start">
                      {isFirst && sender && (
                        <span
                          className="mb-0.5 ml-1 text-xs font-semibold"
                          style={{ color: sender.color }}
                        >
                          {sender.name}
                        </span>
                      )}
                      <div className="group relative">
                        {reactionBtn}
                        {pickerMsgId === message.id && (
                          <EmojiPicker message={message} onClose={() => setPickerMsgId(null)} />
                        )}
                        {bubbleInner(false)}
                      </div>
                      {reactionPills('justify-start')}
                    </div>
                  </div>
                )
              }

              return (
                <div key={message.id} className={`flex flex-col ${message.outgoing ? 'items-end' : 'items-start'}`}>
                  <div className="group relative max-w-[60%]">
                    {reactionBtn}
                    {pickerMsgId === message.id && (
                      <EmojiPicker message={message} onClose={() => setPickerMsgId(null)} />
                    )}
                    {bubbleInner(message.outgoing)}
                  </div>
                  {reactionPills(message.outgoing ? 'justify-end' : 'justify-start')}
                </div>
              )
            })}
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
    </>
  )
}
