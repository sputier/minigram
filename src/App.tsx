import { useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import { mockChats } from './data/mockData'

export default function App() {
  const [activeChatId, setActiveChatId] = useState(mockChats[0]?.id)

  const activeChat = mockChats.find((chat) => chat.id === activeChatId)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-tg-bg text-white">
      <Sidebar chats={mockChats} activeChatId={activeChatId} onSelectChat={setActiveChatId} />
      <ChatView chat={activeChat} />
    </div>
  )
}
