import { useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import AdminGate from './components/AdminGate'
import SyncProgressBar from './components/SyncProgressBar'
import type { SyncProgress, UiChat, UiMessage, UiReaction, UiSelf } from './types/telegram'

export default function App() {
  const [self, setSelf] = useState<UiSelf | null>(null)
  const [chats, setChats] = useState<UiChat[]>([])
  const [activeChatId, setActiveChatId] = useState<number | undefined>(undefined)
  const [messagesByChat, setMessagesByChat] = useState<Record<number, UiMessage[]>>({})
  const [noMoreHistory, setNoMoreHistory] = useState<Record<number, boolean>>({})
  const [loadingMore, setLoadingMore] = useState(false)
  const [mediaVersion, setMediaVersion] = useState(0)
  const [latestReadyPhotoFileId, setLatestReadyPhotoFileId] = useState<number | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({ active: false, mediaPending: 0, mediaDone: 0 })
  const prevActiveChatIdRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    function loadAccount() {
      window.minigram
        .getMe()
        .then(setSelf)
        .catch(() => {
          // Échoue tant que le compte n'est pas connecté, c'est attendu.
        })

      window.minigram
        .getChats()
        .then((loaded) => {
          setChats(loaded)
          setActiveChatId((current) => current ?? loaded[0]?.id)
        })
        .catch(() => {
          // Échoue tant que le compte n'est pas connecté, c'est attendu.
        })
    }

    loadAccount()

    // getMe()/getChats() échouent tant que le compte n'est pas connecté
    // (gate admin) ; on recharge dès que l'auth Telegram passe à "ready".
    return window.minigram.onAuthState((state) => {
      if (state.step === 'ready') loadAccount()
    })
  }, [])

  useEffect(() => {
    if (activeChatId === undefined || messagesByChat[activeChatId]) return
    window.minigram.getHistory(activeChatId).then((history) => {
      setMessagesByChat((prev) => ({ ...prev, [activeChatId]: history }))
    })
  }, [activeChatId, messagesByChat])

  useEffect(() => {
    // Une discussion approuvée/ajoutée depuis le gate admin ne déclenche pas
    // forcément de nouveau message immédiat (onUpdate ne suffit pas) — le
    // main process rediffuse explicitement la liste fraîche après ces actions.
    return window.minigram.onChatsChanged(setChats)
  }, [])

  useEffect(() => {
    return window.minigram.onMediaReady((fileId) => {
      setMediaVersion((v) => v + 1)
      setLatestReadyPhotoFileId(fileId)
    })
  }, [])

  useEffect(() => {
    return window.minigram.onSyncProgress(setSyncProgress)
  }, [])

  useEffect(() => {
    return window.minigram.onFocusChat(setActiveChatId)
  }, [])

  useEffect(() => {
    if (prevActiveChatIdRef.current !== undefined) {
      void window.minigram.closeChat(prevActiveChatIdRef.current)
    }
    if (activeChatId !== undefined) {
      void window.minigram.openChat(activeChatId)
    }
    prevActiveChatIdRef.current = activeChatId
  }, [activeChatId])

  // openChat abonne juste le chat aux updates TDLib, ça ne fait pas avancer
  // le curseur de lecture — sans viewMessages, l'expéditeur ne voit jamais
  // ses messages passer en "lu". Se redéclenche à chaque nouveau message
  // reçu tant que ce chat reste actif (la référence de activeMessages change).
  const activeMessages = activeChatId !== undefined ? messagesByChat[activeChatId] : undefined
  useEffect(() => {
    if (activeChatId === undefined || !activeMessages || activeMessages.length === 0) return
    void window.minigram.viewMessages(
      activeChatId,
      activeMessages.map((m) => m.id),
    )
  }, [activeChatId, activeMessages])

  useEffect(() => {
    return window.minigram.onUpdate((update) => {
      if (update.kind === 'new-message') {
        const { chatId } = update.message
        setMessagesByChat((prev) => {
          const list = prev[chatId] ?? []
          // replacesId : remplace le message optimiste "en cours d'envoi" par
          // sa version confirmée/échouée (même message, id temporaire ->
          // définitif). Sans ça, la confirmation d'un message qu'on vient
          // d'envoyer nous-mêmes s'ajouterait en double au lieu de mettre à
          // jour son statut.
          const replaceId = update.replacesId ?? update.message.id
          const idx = list.findIndex((m) => m.id === replaceId)
          const next = idx === -1 ? [...list, update.message] : list.map((m, i) => (i === idx ? update.message : m))
          return { ...prev, [chatId]: next }
        })
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId ? { ...c, lastMessage: update.message.text, time: update.message.time } : c,
          ),
        )
      } else if (update.kind === 'message-reactions') {
        const { chatId, messageId, reactions } = update
        setMessagesByChat((prev) => ({
          ...prev,
          [chatId]: (prev[chatId] ?? []).map((m) =>
            m.id === messageId ? { ...m, reactions: reactions.length > 0 ? reactions : undefined } : m,
          ),
        }))
      } else if (update.kind === 'chat-last-message') {
        setChats((prev) =>
          prev.map((c) =>
            c.id === update.chatId ? { ...c, lastMessage: update.lastMessage, time: update.time } : c,
          ),
        )
      } else if (update.kind === 'chat-read-inbox') {
        setChats((prev) =>
          prev.map((c) =>
            c.id === update.chatId
              ? { ...c, lastReadInboxMessageId: update.lastReadInboxMessageId, unread: update.unreadCount > 0 ? update.unreadCount : undefined }
              : c,
          ),
        )
      } else if (update.kind === 'chat-read-outbox') {
        setChats((prev) =>
          prev.map((c) =>
            c.id === update.chatId ? { ...c, lastReadOutboxMessageId: update.lastReadOutboxMessageId } : c,
          ),
        )
      }
    })
  }, [])

  const activeChat = chats.find((chat) => chat.id === activeChatId)
  const emptyMessage =
    chats.length === 0
      ? 'Aucune discussion. Connecte le compte Telegram via le gate admin (Ctrl+Alt+Shift+P).'
      : 'Sélectionne une discussion'

  function handleSend(text: string) {
    if (activeChatId === undefined) return
    void window.minigram.sendMessage(activeChatId, text)
  }

  function handleReactionToggle(chatId: number, messageId: number, emoji: string, remove: boolean) {
    setMessagesByChat((prev) => {
      const msgs = prev[chatId] ?? []
      return {
        ...prev,
        [chatId]: msgs.map((m) => {
          if (m.id !== messageId) return m
          const existing = m.reactions ?? []
          let updated: UiReaction[]
          if (remove) {
            updated = existing
              .map((r) => r.emoji === emoji ? { ...r, count: r.count - 1, chosen: false } : r)
              .filter((r) => r.count > 0)
          } else {
            const found = existing.find((r) => r.emoji === emoji)
            updated = found
              ? existing.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, chosen: true } : r)
              : [...existing, { emoji, count: 1, chosen: true, recentSenderIds: [] }]
          }
          return { ...m, reactions: updated.length > 0 ? updated : undefined }
        }),
      }
    })
    if (remove) void window.minigram.removeReaction(chatId, messageId, emoji)
    else void window.minigram.addReaction(chatId, messageId, emoji)
  }

  async function handleOpenPrivateChat(userId: number) {
    const chat = await window.minigram.openPrivateChat(userId)
    if (!chat) return
    // Un chat sans messages n'apparaît pas dans getChats() — on l'injecte
    // directement pour qu'il soit visible même avant le premier message.
    setChats((prev) => (prev.some((c) => c.id === chat.id) ? prev : [chat, ...prev]))
    setActiveChatId(chat.id)
  }

  async function handleLoadMore() {
    if (activeChatId === undefined || loadingMore) return
    const oldest = messagesByChat[activeChatId]?.[0]?.id
    if (oldest === undefined) return

    setLoadingMore(true)
    try {
      const older = await window.minigram.getMoreHistory(activeChatId, oldest)
      if (older.length === 0) {
        setNoMoreHistory((prev) => ({ ...prev, [activeChatId]: true }))
      } else {
        setMessagesByChat((prev) => ({ ...prev, [activeChatId]: [...older, ...(prev[activeChatId] ?? [])] }))
      }
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-tg-bg text-white">
      <SyncProgressBar {...syncProgress} />
      <Sidebar self={self} chats={chats} activeChatId={activeChatId} onSelectChat={setActiveChatId} latestReadyPhotoFileId={latestReadyPhotoFileId} />
      <ChatView
        chat={activeChat}
        messages={activeChatId !== undefined ? messagesByChat[activeChatId] ?? [] : []}
        onSend={handleSend}
        onReactionToggle={handleReactionToggle}
        onOpenPrivateChat={handleOpenPrivateChat}
        emptyMessage={emptyMessage}
        onLoadMore={handleLoadMore}
        hasMore={activeChatId !== undefined ? !noMoreHistory[activeChatId] : false}
        loadingMore={loadingMore}
        mediaVersion={mediaVersion}
        latestReadyPhotoFileId={latestReadyPhotoFileId}
      />
      <AdminGate />
    </div>
  )
}
