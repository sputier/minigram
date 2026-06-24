import type { AuthState, MappedUpdate, UiChat, UiMessage, UiSelf } from './telegram'

type Unsubscribe = () => void

declare global {
  interface Window {
    minigram: {
      version: string
      onAdminGateToggle: (cb: () => void) => Unsubscribe
      submitAdminPassword: (password: string) => Promise<{ ok: boolean }>
      onAuthState: (cb: (state: AuthState) => void) => Unsubscribe
      submitPhoneNumber: (phone: string) => Promise<void>
      submitAuthCode: (code: string) => Promise<void>
      submitAuthPassword: (password: string) => Promise<void>
      getMe: () => Promise<UiSelf | null>
      getChats: () => Promise<UiChat[]>
      getHistory: (chatId: number) => Promise<UiMessage[]>
      sendMessage: (chatId: number, text: string) => Promise<void>
      onUpdate: (cb: (update: MappedUpdate) => void) => Unsubscribe
    }
  }
}

export {}
