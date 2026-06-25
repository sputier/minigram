export type UiMediaKind = 'photo' | 'video' | 'voice' | 'document' | 'sticker' | 'animation'

export interface UiMediaRef {
  fileId: number
  kind: UiMediaKind
  mimeType?: string
  fileName?: string
}

export interface UiMessage {
  id: number
  chatId: number
  text: string
  time: string
  outgoing: boolean
  media?: UiMediaRef
}

export interface UiChat {
  id: number
  name: string
  initials: string
  color: string
  lastMessage: string
  time: string
  unread?: number
}

export interface UiSelf {
  id: number
  name: string
  initials: string
  color: string
}

export type MappedUpdate =
  | { kind: 'chat-last-message'; chatId: number; lastMessage: string; time: string }
  | { kind: 'new-message'; message: UiMessage }
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
