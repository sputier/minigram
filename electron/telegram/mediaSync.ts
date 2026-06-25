import fs from 'node:fs'
import path from 'node:path'

export type MediaStatus = 'pending' | 'done'

export interface MediaEntry {
  fileId: number
  chatId: number
  messageId: number
  status: MediaStatus
}

export interface MediaSyncState {
  entries: MediaEntry[]
}

const EMPTY_STATE: MediaSyncState = { entries: [] }

function isMediaEntry(value: unknown): value is MediaEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.fileId === 'number' &&
    typeof v.chatId === 'number' &&
    typeof v.messageId === 'number' &&
    (v.status === 'pending' || v.status === 'done')
  )
}

function isMediaSyncState(value: unknown): value is MediaSyncState {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.entries) && v.entries.every(isMediaEntry)
}

// Ne throw jamais : un media-sync.json absent/corrompu fait juste repartir
// la détection de médias à zéro, pas planter l'app.
export function loadMediaSyncState(filePath: string): MediaSyncState {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return isMediaSyncState(parsed) ? parsed : EMPTY_STATE
  } catch {
    return EMPTY_STATE
  }
}

export function saveMediaSyncState(filePath: string, state: MediaSyncState): void {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2))
}

export function ensureMediaSyncStateFile(filePath: string): void {
  if (fs.existsSync(filePath)) return
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(EMPTY_STATE, null, 2))
}

export function getPending(state: MediaSyncState): MediaEntry[] {
  return state.entries.filter((e) => e.status === 'pending')
}

// Dédup par fileId : un même fichier peut être référencé par plusieurs
// messages (sticker réutilisé, média transféré), pas la peine de le
// retélécharger plusieurs fois.
export function addPendingMedia(state: MediaSyncState, entry: Omit<MediaEntry, 'status'>): MediaSyncState {
  if (state.entries.some((e) => e.fileId === entry.fileId)) return state
  return { entries: [...state.entries, { ...entry, status: 'pending' }] }
}

export function markDone(state: MediaSyncState, fileId: number): MediaSyncState {
  const index = state.entries.findIndex((e) => e.fileId === fileId)
  if (index === -1 || state.entries[index]!.status === 'done') return state

  const entries = [...state.entries]
  entries[index] = { ...entries[index]!, status: 'done' }
  return { entries }
}
