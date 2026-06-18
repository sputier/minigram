import type { AuthState, MappedUpdate, UiChat, UiMessage } from './telegram'

declare global {
  interface Window {
    minigram: {
      version: string
      onAdminGateToggle: (cb: () => void) => void
      submitAdminPassword: (password: string) => Promise<{ ok: boolean }>
      onAuthState: (cb: (state: AuthState) => void) => void
      submitPhoneNumber: (phone: string) => Promise<void>
      submitAuthCode: (code: string) => Promise<void>
      submitAuthPassword: (password: string) => Promise<void>
      getChats: () => Promise<UiChat[]>
      getHistory: (chatId: number) => Promise<UiMessage[]>
      sendMessage: (chatId: number, text: string) => Promise<void>
      onUpdate: (cb: (update: MappedUpdate) => void) => void
    }
  }
}

export {}
