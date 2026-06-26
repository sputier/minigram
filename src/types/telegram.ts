export type UiMediaKind = 'photo' | 'video' | 'voice' | 'document' | 'sticker' | 'animation'

export interface UiMediaRef {
  fileId: number
  kind: UiMediaKind
  mimeType?: string
  fileName?: string
}

export interface UiReaction {
  emoji: string
  count: number
  chosen: boolean
  recentSenderIds: number[]
}

export interface UiUserAvatar {
  userId: number
  photoFileId: number | null
  initials: string
  color: string
  name: string
}

export interface UiMessage {
  id: number
  chatId: number
  text: string
  time: string
  outgoing: boolean
  senderId?: number
  media?: UiMediaRef
  reactions?: UiReaction[]
}

export interface UiChat {
  id: number
  name: string
  initials: string
  color: string
  photoFileId: number | null
  isGroup: boolean
  lastMessage: string
  time: string
  unread?: number
}

export interface UiSelf {
  id: number
  name: string
  initials: string
  color: string
  photoFileId: number | null
}

export type MappedUpdate =
  | { kind: 'chat-last-message'; chatId: number; lastMessage: string; time: string }
  | { kind: 'new-message'; message: UiMessage }
  | { kind: 'message-reactions'; chatId: number; messageId: number; reactions: UiReaction[] }
  | { kind: 'connection-state'; state: string }
  | { kind: 'user-status'; userId: number; status: string }

export type AuthState =
  | { step: 'idle' }
  | { step: 'phone'; retry: boolean }
  | { step: 'code'; retry: boolean }
  | { step: 'password'; hint: string; retry: boolean }
  | { step: 'ready' }
  | { step: 'error'; message: string }

export interface PendingEntry {
  kind: 'user' | 'chat'
  id: number
  name: string
  preview: string
  firstSeen: number
}

export interface SearchResult {
  kind: 'user' | 'chat'
  id: number
  name: string
}

export interface SyncProgress {
  active: boolean
  mediaPending: number
  mediaDone: number
}
