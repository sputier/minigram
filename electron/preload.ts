import { contextBridge, ipcRenderer } from 'electron'
import type { AuthState } from './telegram/client'
import type { MappedUpdate, UiChat, UiMessage, UiSelf } from './telegram/mapUpdate'

export type Unsubscribe = () => void

export interface MinigramApi {
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

const api: MinigramApi = {
  version: process.versions.electron,
  onAdminGateToggle: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('admin:toggle-gate', listener)
    return () => ipcRenderer.off('admin:toggle-gate', listener)
  },
  submitAdminPassword: (password) => ipcRenderer.invoke('admin:submit-password', password),
  onAuthState: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AuthState) => cb(state)
    ipcRenderer.on('tg:auth-state', listener)
    return () => ipcRenderer.off('tg:auth-state', listener)
  },
  submitPhoneNumber: (phone) => ipcRenderer.invoke('admin:submit-phone', phone),
  submitAuthCode: (code) => ipcRenderer.invoke('admin:submit-code', code),
  submitAuthPassword: (password) => ipcRenderer.invoke('admin:submit-auth-password', password),
  getMe: () => ipcRenderer.invoke('tg:get-me'),
  getChats: () => ipcRenderer.invoke('tg:get-chats'),
  getHistory: (chatId) => ipcRenderer.invoke('tg:get-history', chatId),
  sendMessage: (chatId, text) => ipcRenderer.invoke('tg:send-message', chatId, text),
  onUpdate: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, update: MappedUpdate) => cb(update)
    ipcRenderer.on('tg:update', listener)
    return () => ipcRenderer.off('tg:update', listener)
  },
}

contextBridge.exposeInMainWorld('minigram', api)
