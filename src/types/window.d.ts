import type { AuthState, MappedUpdate, PendingEntry, SearchResult, SyncProgress, UiChat, UiMessage, UiSelf, UiUserAvatar } from './telegram'

type Unsubscribe = () => void

declare global {
  interface Window {
    minigram: {
      version: string
      onAdminGateToggle: (cb: () => void) => Unsubscribe
      submitAdminPassword: (password: string) => Promise<{ ok: boolean }>
      onAuthState: (cb: (state: AuthState) => void) => Unsubscribe
      getAuthState: () => Promise<AuthState>
      submitPhoneNumber: (phone: string) => Promise<void>
      submitAuthCode: (code: string) => Promise<void>
      submitAuthPassword: (password: string) => Promise<void>
      getMe: () => Promise<UiSelf | null>
      getChats: () => Promise<UiChat[]>
      getHistory: (chatId: number) => Promise<UiMessage[]>
      getMoreHistory: (chatId: number, beforeMessageId: number) => Promise<UiMessage[]>
      sendMessage: (chatId: number, text: string) => Promise<void>
      onUpdate: (cb: (update: MappedUpdate) => void) => Unsubscribe
      onChatsChanged: (cb: (chats: UiChat[]) => void) => Unsubscribe
      onMediaReady: (cb: (fileId: number) => void) => Unsubscribe
      onSyncProgress: (cb: (progress: SyncProgress) => void) => Unsubscribe
      getPendingRequests: () => Promise<PendingEntry[]>
      approvePending: (kind: 'user' | 'chat', id: number) => Promise<PendingEntry[]>
      rejectPending: (kind: 'user' | 'chat', id: number) => Promise<PendingEntry[]>
      searchContacts: (query: string) => Promise<SearchResult[]>
      addToWhitelist: (kind: 'user' | 'chat', id: number) => Promise<void>
      getUserAvatars: (userIds: number[]) => Promise<UiUserAvatar[]>
      addReaction: (chatId: number, messageId: number, emoji: string) => Promise<void>
      removeReaction: (chatId: number, messageId: number, emoji: string) => Promise<void>
      getGroupMembers: (chatId: number) => Promise<UiUserAvatar[]>
      openPrivateChat: (userId: number) => Promise<UiChat | null>
      openChat: (chatId: number) => Promise<void>
      closeChat: (chatId: number) => Promise<void>
      onFocusChat: (cb: (chatId: number) => void) => Unsubscribe
    }
  }
}

export {}
