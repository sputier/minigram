import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import AdminGate from './components/AdminGate'
import type { UiChat, UiMessage, UiSelf } from './types/telegram'

export default function App() {
  const [self, setSelf] = useState<UiSelf | null>(null)
  const [chats, setChats] = useState<UiChat[]>([])
  const [activeChatId, setActiveChatId] = useState<number | undefined>(undefined)
  const [messagesByChat, setMessagesByChat] = useState<Record<number, UiMessage[]>>({})

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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-tg-bg text-white">
      <Sidebar self={self} chats={chats} activeChatId={activeChatId} onSelectChat={setActiveChatId} />
      <ChatView
        chat={activeChat}
        messages={activeChatId !== undefined ? messagesByChat[activeChatId] ?? [] : []}
        onSend={handleSend}
        emptyMessage={emptyMessage}
      />
      <AdminGate />
    </div>
  )
}
