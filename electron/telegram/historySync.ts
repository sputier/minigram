import fs from 'node:fs'
import path from 'node:path'

export interface ChatSyncProgress {
  chatId: number
  oldestMessageId: number
  complete: boolean
}

export interface SyncState {
  chats: ChatSyncProgress[]
}

const EMPTY_STATE: SyncState = { chats: [] }

function isChatSyncProgress(value: unknown): value is ChatSyncProgress {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.chatId === 'number' && typeof v.oldestMessageId === 'number' && typeof v.complete === 'boolean'
}

function isSyncState(value: unknown): value is SyncState {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.chats) && v.chats.every(isChatSyncProgress)
}

// Ne throw jamais : un history-sync.json absent/corrompu doit juste faire
// repartir le sync de zéro pour les chats concernés, pas planter l'app.
export function loadSyncState(filePath: string): SyncState {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return isSyncState(parsed) ? parsed : EMPTY_STATE
  } catch {
    return EMPTY_STATE
  }
}

export function saveSyncState(filePath: string, state: SyncState): void {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2))
}

export function ensureSyncStateFile(filePath: string): void {
  if (fs.existsSync(filePath)) return
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(EMPTY_STATE, null, 2))
}

export function getProgress(state: SyncState, chatId: number): ChatSyncProgress | undefined {
  return state.chats.find((c) => c.chatId === chatId)
}

export function upsertProgress(state: SyncState, progress: ChatSyncProgress): SyncState {
  const index = state.chats.findIndex((c) => c.chatId === progress.chatId)
  if (index === -1) return { chats: [...state.chats, progress] }

  const existing = state.chats[index]!
  if (existing.oldestMessageId === progress.oldestMessageId && existing.complete === progress.complete) {
    return state
  }

  const chats = [...state.chats]
  chats[index] = progress
  return { chats }
}
