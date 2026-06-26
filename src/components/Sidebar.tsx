import { useState } from 'react'
import Avatar from './Avatar'
import type { UiChat, UiSelf } from '../types/telegram'

interface SidebarProps {
  self: UiSelf | null
  chats: UiChat[]
  activeChatId: number | undefined
  onSelectChat: (id: number) => void
  latestReadyPhotoFileId: number | null
}

export default function Sidebar({ self, chats, activeChatId, onSelectChat, latestReadyPhotoFileId }: SidebarProps) {
  const [filter, setFilter] = useState('')

  const filteredChats = chats.filter((chat) =>
    chat.name.toLowerCase().includes(filter.toLowerCase()),
  )

  return (
    <aside className="flex h-full w-[320px] flex-shrink-0 flex-col bg-tg-sidebar">
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar
          photoFileId={self?.photoFileId ?? null}
          initials={self?.initials ?? 'MG'}
          color={self?.color ?? '#2b5278'}
          className="h-9 w-9 text-sm"
          title={self?.name ?? 'Non connecté'}
          latestReadyFileId={latestReadyPhotoFileId}
        />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrer mes discussions"
          className="flex-1 rounded-full bg-tg-bg px-4 py-2 text-sm text-white placeholder-tg-muted outline-none"
        />
      </div>

      <nav className="flex-1 overflow-y-auto">
        {filteredChats.map((chat) => (
          <button
            key={chat.id}
            onClick={() => onSelectChat(chat.id)}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
              chat.id === activeChatId ? 'bg-tg-bg' : 'hover:bg-white/5'
            }`}
          >
            <Avatar
              photoFileId={chat.photoFileId}
              initials={chat.initials}
              color={chat.color}
              className="h-12 w-12 text-lg"
              latestReadyFileId={latestReadyPhotoFileId}
            />
            <div className="flex-1 overflow-hidden border-b border-tg-border/0 pb-3 pt-0">
              <div className="flex items-baseline justify-between">
                <span className="truncate font-medium text-white">{chat.name}</span>
                <span className="ml-2 flex-shrink-0 text-xs text-tg-muted">{chat.time}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="truncate text-sm text-tg-muted">{chat.lastMessage}</span>
                {chat.unread ? (
                  <span className="ml-2 flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-tg-accent px-1.5 text-xs font-semibold text-white">
                    {chat.unread}
                  </span>
                ) : null}
              </div>
            </div>
          </button>
        ))}
      </nav>
    </aside>
  )
}
