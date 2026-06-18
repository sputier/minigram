import { contextBridge, ipcRenderer } from 'electron'
import type { AuthState } from './telegram/client'
import type { MappedUpdate, UiChat, UiMessage } from './telegram/mapUpdate'

export interface MinigramApi {
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

const api: MinigramApi = {
  version: process.versions.electron,
  onAdminGateToggle: (cb) => {
    ipcRenderer.on('admin:toggle-gate', () => cb())
  },
  submitAdminPassword: (password) => ipcRenderer.invoke('admin:submit-password', password),
  onAuthState: (cb) => {
    ipcRenderer.on('tg:auth-state', (_event, state: AuthState) => cb(state))
  },
  submitPhoneNumber: (phone) => ipcRenderer.invoke('admin:submit-phone', phone),
  submitAuthCode: (code) => ipcRenderer.invoke('admin:submit-code', code),
  submitAuthPassword: (password) => ipcRenderer.invoke('admin:submit-auth-password', password),
  getChats: () => ipcRenderer.invoke('tg:get-chats'),
  getHistory: (chatId) => ipcRenderer.invoke('tg:get-history', chatId),
  sendMessage: (chatId, text) => ipcRenderer.invoke('tg:send-message', chatId, text),
  onUpdate: (cb) => {
    ipcRenderer.on('tg:update', (_event, update: MappedUpdate) => cb(update))
  },
}

contextBridge.exposeInMainWorld('minigram', api)
