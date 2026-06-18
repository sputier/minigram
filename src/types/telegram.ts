export interface UiMessage {
  id: number
  chatId: number
  text: string
  time: string
  outgoing: boolean
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
