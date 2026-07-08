import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  onReactionToggle: ReactionToggle
  onOpenPrivateChat: (userId: number) => void
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

type ReactionToggle = (chatId: number, messageId: number, emoji: string, remove: boolean) => void

function EmojiPicker({ message, onClose, onReactionToggle }: { message: UiMessage; onClose: () => void; onReactionToggle: ReactionToggle }) {
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
      className="absolute bottom-full left-0 z-20 flex rounded-full bg-[#1e2c3a] px-2 py-1.5 shadow-xl ring-1 ring-white/10"
    >
      {QUICK_REACTIONS.map((emoji) => {
        const chosen = message.reactions?.find((r) => r.emoji === emoji)?.chosen ?? false
        return (
          <button
            key={emoji}
            title={chosen ? 'Retirer la réaction' : 'Réagir'}
            onClick={() => {
              onReactionToggle(message.chatId, message.id, emoji, chosen)
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

function ReactionPill({ reaction, chatId, messageId, onReactionToggle }: { reaction: UiReaction; chatId: number; messageId: number; onReactionToggle: ReactionToggle }) {
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
    onReactionToggle(chatId, messageId, reaction.emoji, reaction.chosen)
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

type MediaFailReason = 'pending'

function VoicePlayer({ src, onError }: { src: string; onError: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => () => { audioRef.current?.pause() }, [])

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else void audio.play()
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current
    if (!audio || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration
  }

  function fmt(s: number) {
    if (!isFinite(s) || s < 0) return '0:00'
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  const progress = duration > 0 ? currentTime / duration : 0

  return (
    <div className="flex min-w-[200px] items-center gap-2.5 py-0.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onError={onError}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); if (audioRef.current) audioRef.current.currentTime = 0 }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
      />
      <button
        onClick={toggle}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 active:bg-white/40"
      >
        <span className="text-base leading-none">{playing ? '⏸' : '▶'}</span>
      </button>
      <div className="flex flex-1 flex-col gap-1.5">
        <div
          className="relative h-1.5 cursor-pointer overflow-hidden rounded-full bg-white/20"
          onClick={handleSeek}
        >
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/70" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="text-[10px] text-white/50">{playing ? fmt(currentTime) : fmt(duration || currentTime)}</div>
      </div>
    </div>
  )
}

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
  const mimeParam = media.mimeType ? `&mime=${encodeURIComponent(media.mimeType)}` : ''
  const src = `minigram-media://media?id=${media.fileId}&v=${version}${mimeParam}`

  useEffect(() => setFailed(null), [version, media.fileId])

  if (failed) {
    return <div className="text-xs italic text-white/60">Téléchargement du média en cours…</div>
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
            onError={() => setFailed('pending')}
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
      return <VoicePlayer src={src} onError={() => setFailed('pending')} />
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

// Un message sortant sans `status` (chargé depuis l'historique, ou déjà
// confirmé par updateMessageSendSucceeded) n'est jamais "en cours d'envoi" —
// son statut "envoyé" vs "lu" se déduit en comparant son id au watermark de
// lecture de nos messages par le correspondant (chat.lastReadOutboxMessageId,
// alimenté par updateChatReadOutbox côté TDLib).
function MessageStatusTick({ message, chat }: { message: UiMessage; chat: UiChat }) {
  if (message.status === 'sending') {
    return <span title="Envoi en cours">🕒</span>
  }
  if (message.status === 'failed') {
    return (
      <span className="text-red-400" title="Échec de l'envoi">
        ⚠
      </span>
    )
  }
  const read = (chat.lastReadOutboxMessageId ?? 0) >= message.id
  return (
    <span className={read ? 'text-tg-accent' : ''} title={read ? 'Lu' : 'Envoyé'}>
      {read ? '✓✓' : '✓'}
    </span>
  )
}

export default function ChatView({
  chat,
  messages,
  onSend,
  onReactionToggle,
  onOpenPrivateChat,
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
  const [showMembers, setShowMembers] = useState(false)
  const [groupMembers, setGroupMembers] = useState<UiUserAvatar[]>([])
  const senderAvatars = useSenderAvatars(messages, chat?.isGroup ?? false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const membersPanelRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef<number | null>(null)
  const prevLastIdRef = useRef<number | null>(null)
  const justOpenedRef = useRef(true)
  const snapshotReadIdRef = useRef<number | undefined>(undefined)
  const prevChatIdForScrollRef = useRef<number | undefined>(undefined)

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
    const chatChanged = chat?.id !== prevChatIdForScrollRef.current

    if (chatChanged) {
      // Réinitialiser tout l'état de scroll quand on change de chat.
      // Doit être fait ici (pas dans useEffect) car useEffect s'exécute
      // APRÈS useLayoutEffect — si on attendait useEffect, justOpenedRef
      // serait encore false de l'ancien chat pour le premier useLayoutEffect
      // du nouveau, ce qui empêchait le scroll vers le bas.
      prevChatIdForScrollRef.current = chat?.id
      prevLastIdRef.current = null
      prevScrollHeightRef.current = null
      snapshotReadIdRef.current = undefined // nettoyage du snapshot périmé
      justOpenedRef.current = true
    }

    if (prevScrollHeightRef.current !== null && el) {
      el.scrollTop += el.scrollHeight - prevScrollHeightRef.current
      prevScrollHeightRef.current = null
    } else if (lastId !== prevLastIdRef.current) {
      if (justOpenedRef.current && dividerRef.current) {
        dividerRef.current.scrollIntoView({ block: 'center' })
      } else if (el) {
        el.scrollTop = el.scrollHeight
      }
      justOpenedRef.current = false
    }

    prevLastIdRef.current = lastId
  }, [messages, chat?.id])

  useEffect(() => {
    // Positionne le snapshot APRÈS que useLayoutEffect a nettoyé l'ancien.
    // Pour les chats sans messages en cache, ce snapshot est prêt quand
    // getHistory revient (useEffect s'exécute avant que l'IPC réponde).
    if ((chat?.unread ?? 0) > 0) {
      snapshotReadIdRef.current = chat?.lastReadInboxMessageId
    }
    setShowMembers(false)
    setGroupMembers([])
  }, [chat?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showMembers) return
    function handleMouseDown(e: MouseEvent) {
      if (membersPanelRef.current && !membersPanelRef.current.contains(e.target as Node)) {
        setShowMembers(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [showMembers])

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
          {chat.isGroup && (
            <div ref={membersPanelRef} className="relative ml-auto">
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (!showMembers && groupMembers.length === 0) {
                    window.minigram.getGroupMembers(chat.id).then(setGroupMembers)
                  }
                  setShowMembers((v) => !v)
                }}
                className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs text-tg-muted transition-colors hover:bg-white/10 hover:text-white"
              >
                👥{groupMembers.length > 0 ? ` ${groupMembers.length} membres` : ' Membres'}
              </button>
              {showMembers && (
                <div className="absolute right-0 top-full z-30 mt-1 min-w-[200px] rounded-xl bg-[#1e2c3a] py-2 shadow-xl ring-1 ring-white/10">
                  {groupMembers.length === 0 ? (
                    <div className="px-4 py-2 text-xs text-tg-muted">Chargement…</div>
                  ) : (
                    groupMembers.map((member) => (
                      <button
                        key={member.userId}
                        onClick={() => {
                          onOpenPrivateChat(member.userId)
                          setShowMembers(false)
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/5"
                      >
                        <Avatar
                          photoFileId={member.photoFileId}
                          initials={member.initials}
                          color={member.color}
                          className="h-8 w-8 flex-shrink-0 text-xs"
                        />
                        <span className="text-white">{member.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
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

              const showDivider =
                snapshotReadIdRef.current !== undefined &&
                message.id > snapshotReadIdRef.current &&
                (index === 0 || messages[index - 1]!.id <= snapshotReadIdRef.current)

              const bubbleInner = (outgoing: boolean) => {
                let replyBlock: React.ReactNode = null
                if (message.replyToMessageId) {
                  const replied = messages.find((m) => m.id === message.replyToMessageId)
                  let authorName = ''
                  let authorColor = '#65aadd'
                  let replyText = 'Message non disponible'
                  if (replied) {
                    if (replied.outgoing) {
                      authorName = 'Vous'
                      authorColor = '#6ab3f3'
                    } else if (replied.senderId) {
                      const av = senderAvatars.get(replied.senderId)
                      authorName = av?.name ?? chat.name
                      authorColor = av?.color ?? chat.color
                    } else {
                      authorName = chat.name
                      authorColor = chat.color
                    }
                    replyText =
                      replied.text ||
                      (replied.media
                        ? { photo: '📷 Photo', video: '🎥 Vidéo', voice: '🎤 Vocal', document: '📄 Document', sticker: 'Sticker', animation: 'GIF' }[replied.media.kind] ?? '📎 Média'
                        : '…')
                  }
                  replyBlock = (
                    <div
                      className="mb-2 rounded bg-black/15 px-2 py-1.5"
                      style={{ borderLeft: `3px solid ${authorColor}` }}
                    >
                      {authorName && (
                        <div className="text-xs font-semibold leading-tight" style={{ color: authorColor }}>
                          {authorName}
                        </div>
                      )}
                      <div className="mt-0.5 line-clamp-1 text-xs text-white/70">{replyText}</div>
                    </div>
                  )
                }
                return (
                  <div
                    className={`rounded-xl px-3 py-2 text-sm text-white shadow ${
                      outgoing ? 'rounded-br-sm bg-tg-bubble-out' : 'rounded-bl-sm bg-tg-bubble-in'
                    }`}
                  >
                    {replyBlock}
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
                    <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/50">
                      <span>{message.time}</span>
                      {outgoing && <MessageStatusTick message={message} chat={chat} />}
                    </div>
                  </div>
                )
              }

              const reactionPills = (justify: 'justify-start' | 'justify-end') =>
                message.reactions && message.reactions.length > 0 ? (
                  <div className={`relative -mt-1 mb-1 flex flex-wrap gap-1 ${justify}`}>
                    {message.reactions.map((r) => (
                      <ReactionPill key={r.emoji} reaction={r} chatId={message.chatId} messageId={message.id} onReactionToggle={onReactionToggle} />
                    ))}
                  </div>
                ) : null

              const reactionBtn = (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setPickerMsgId((id) => (id === message.id ? null : message.id))}
                  className={`absolute top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-[#1e2c3a] text-sm text-white/50 shadow ring-1 ring-white/10 hover:text-white group-hover:flex ${
                    message.outgoing ? '-left-6' : '-right-6'
                  }`}
                  title="Ajouter une réaction"
                >
                  😊
                </button>
              )

              if (!message.outgoing && isGroupChat && message.senderId) {
                return (
                  <div key={message.id}>
                  {showDivider && (
                    <div ref={dividerRef} className="my-3 flex items-center gap-3">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-xs text-tg-muted">Nouveaux messages</span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                  )}
                  <div className="flex flex-row items-start gap-2">
                    {isLast && sender ? (
                      <Avatar
                        photoFileId={sender.photoFileId}
                        initials={sender.initials}
                        color={sender.color}
                        className="h-8 w-8 flex-shrink-0 cursor-pointer text-xs"
                        onClick={() => onOpenPrivateChat(sender.userId)}
                      />
                    ) : (
                      <div className="h-8 w-8 flex-shrink-0" />
                    )}
                    <div className="flex max-w-[60%] flex-col items-start">
                      {isFirst && sender && (
                        <span
                          className="mb-0.5 ml-1 cursor-pointer text-xs font-semibold hover:underline"
                          style={{ color: sender.color }}
                          onClick={() => onOpenPrivateChat(sender.userId)}
                        >
                          {sender.name}
                        </span>
                      )}
                      <div className="group relative">
                        {reactionBtn}
                        {pickerMsgId === message.id && (
                          <EmojiPicker message={message} onClose={() => setPickerMsgId(null)} onReactionToggle={onReactionToggle} />
                        )}
                        {bubbleInner(false)}
                      </div>
                      {reactionPills('justify-start')}
                    </div>
                  </div>
                  </div>
                )
              }

              return (
                <div key={message.id}>
                  {showDivider && (
                    <div ref={dividerRef} className="my-3 flex items-center gap-3">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-xs text-tg-muted">Nouveaux messages</span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                  )}
                  <div className={`flex flex-col ${message.outgoing ? 'items-end' : 'items-start'}`}>
                  <div className="group relative max-w-[60%]">
                    {reactionBtn}
                    {pickerMsgId === message.id && (
                      <EmojiPicker message={message} onClose={() => setPickerMsgId(null)} onReactionToggle={onReactionToggle} />
                    )}
                    {bubbleInner(message.outgoing)}
                  </div>
                    {reactionPills(message.outgoing ? 'justify-end' : 'justify-start')}
                  </div>
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
