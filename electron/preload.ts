import { contextBridge, ipcRenderer } from 'electron'
import type { AuthState, SearchResult, SyncProgress, UiUserAvatar } from './telegram/client'
import type { MappedUpdate, UiChat, UiMessage, UiSelf } from './telegram/mapUpdate'
import type { PendingEntry } from './telegram/pendingRequests'

export type Unsubscribe = () => void

export interface MinigramApi {
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
  viewMessages: (chatId: number, messageIds: number[]) => Promise<void>
  onFocusChat: (cb: (chatId: number) => void) => Unsubscribe
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
  getAuthState: () => ipcRenderer.invoke('tg:get-auth-state'),
  submitPhoneNumber: (phone) => ipcRenderer.invoke('admin:submit-phone', phone),
  submitAuthCode: (code) => ipcRenderer.invoke('admin:submit-code', code),
  submitAuthPassword: (password) => ipcRenderer.invoke('admin:submit-auth-password', password),
  getMe: () => ipcRenderer.invoke('tg:get-me'),
  getChats: () => ipcRenderer.invoke('tg:get-chats'),
  getHistory: (chatId) => ipcRenderer.invoke('tg:get-history', chatId),
  getMoreHistory: (chatId, beforeMessageId) => ipcRenderer.invoke('tg:get-more-history', chatId, beforeMessageId),
  sendMessage: (chatId, text) => ipcRenderer.invoke('tg:send-message', chatId, text),
  onUpdate: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, update: MappedUpdate) => cb(update)
    ipcRenderer.on('tg:update', listener)
    return () => ipcRenderer.off('tg:update', listener)
  },
  onChatsChanged: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, chats: UiChat[]) => cb(chats)
    ipcRenderer.on('tg:chats-changed', listener)
    return () => ipcRenderer.off('tg:chats-changed', listener)
  },
  onMediaReady: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, fileId: number) => cb(fileId)
    ipcRenderer.on('tg:media-ready', listener)
    return () => ipcRenderer.off('tg:media-ready', listener)
  },
  onSyncProgress: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: SyncProgress) => cb(progress)
    ipcRenderer.on('tg:sync-progress', listener)
    return () => ipcRenderer.off('tg:sync-progress', listener)
  },
  getPendingRequests: () => ipcRenderer.invoke('admin:get-pending'),
  approvePending: (kind, id) => ipcRenderer.invoke('admin:approve-pending', kind, id),
  rejectPending: (kind, id) => ipcRenderer.invoke('admin:reject-pending', kind, id),
  searchContacts: (query) => ipcRenderer.invoke('admin:search-contacts', query),
  addToWhitelist: (kind, id) => ipcRenderer.invoke('admin:add-to-whitelist', kind, id),
  getUserAvatars: (userIds) => ipcRenderer.invoke('tg:get-user-avatars', userIds),
  addReaction: (chatId, messageId, emoji) => ipcRenderer.invoke('tg:add-reaction', chatId, messageId, emoji),
  removeReaction: (chatId, messageId, emoji) => ipcRenderer.invoke('tg:remove-reaction', chatId, messageId, emoji),
  getGroupMembers: (chatId) => ipcRenderer.invoke('tg:get-group-members', chatId),
  openPrivateChat: (userId) => ipcRenderer.invoke('tg:open-private-chat', userId),
  openChat: (chatId) => ipcRenderer.invoke('tg:open-chat', chatId),
  closeChat: (chatId) => ipcRenderer.invoke('tg:close-chat', chatId),
  viewMessages: (chatId, messageIds) => ipcRenderer.invoke('tg:view-messages', chatId, messageIds),
  onFocusChat: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, chatId: number) => cb(chatId)
    ipcRenderer.on('tg:focus-chat', listener)
    return () => ipcRenderer.off('tg:focus-chat', listener)
  },
}

contextBridge.exposeInMainWorld('minigram', api)
