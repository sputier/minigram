import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import AdminGate from './components/AdminGate'
import SyncProgressBar from './components/SyncProgressBar'
import type { SyncProgress, UiChat, UiMessage, UiSelf } from './types/telegram'

export default function App() {
  const [self, setSelf] = useState<UiSelf | null>(null)
  const [chats, setChats] = useState<UiChat[]>([])
  const [activeChatId, setActiveChatId] = useState<number | undefined>(undefined)
  const [messagesByChat, setMessagesByChat] = useState<Record<number, UiMessage[]>>({})
  const [noMoreHistory, setNoMoreHistory] = useState<Record<number, boolean>>({})
  const [loadingMore, setLoadingMore] = useState(false)
  const [mediaVersion, setMediaVersion] = useState(0)
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({ active: false, mediaPending: 0, mediaDone: 0 })

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
    return window.minigram.onMediaReady(() => setMediaVersion((v) => v + 1))
  }, [])

  useEffect(() => {
    return window.minigram.onSyncProgress(setSyncProgress)
  }, [])

  useEffect(() => {
    return window.minigram.onUpdate((update) => {
      if (update.kind === 'new-message') {
        const { chatId } = update.message
        setMessagesByChat((prev) => ({
          ...prev,
          [chatId]: [...(prev[chatId] ?? []), update.message],
        }))
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId ? { ...c, lastMessage: update.message.text, time: update.message.time } : c,
          ),
        )
      } else if (update.kind === 'chat-last-message') {
        setChats((prev) =>
          prev.map((c) =>
            c.id === update.chatId ? { ...c, lastMessage: update.lastMessage, time: update.time } : c,
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
      <Sidebar self={self} chats={chats} activeChatId={activeChatId} onSelectChat={setActiveChatId} />
      <ChatView
        chat={activeChat}
        messages={activeChatId !== undefined ? messagesByChat[activeChatId] ?? [] : []}
        onSend={handleSend}
        emptyMessage={emptyMessage}
        onLoadMore={handleLoadMore}
        hasMore={activeChatId !== undefined ? !noMoreHistory[activeChatId] : false}
        loadingMore={loadingMore}
        mediaVersion={mediaVersion}
      />
      <AdminGate />
    </div>
  )
}
