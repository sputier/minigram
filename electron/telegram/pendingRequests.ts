import fs from 'node:fs'
import path from 'node:path'

export interface PendingEntry {
  kind: 'user' | 'chat'
  id: number
  name: string
  preview: string
  firstSeen: number
}

export interface BlockedEntry {
  kind: 'user' | 'chat'
  id: number
}

export interface PendingStore {
  pending: PendingEntry[]
  blocked: BlockedEntry[]
}

const EMPTY_STORE: PendingStore = { pending: [], blocked: [] }

function isPendingEntry(value: unknown): value is PendingEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    (v.kind === 'user' || v.kind === 'chat') &&
    typeof v.id === 'number' &&
    typeof v.name === 'string' &&
    typeof v.preview === 'string' &&
    typeof v.firstSeen === 'number'
  )
}

function isBlockedEntry(value: unknown): value is BlockedEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (v.kind === 'user' || v.kind === 'chat') && typeof v.id === 'number'
}

function isPendingStore(value: unknown): value is PendingStore {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    Array.isArray(v.pending) &&
    v.pending.every(isPendingEntry) &&
    Array.isArray(v.blocked) &&
    v.blocked.every(isBlockedEntry)
  )
}

// Ne throw jamais : un pending-chats.json absent/corrompu doit fermer
// l'accès (aucune demande en attente connue), pas faire planter l'app.
export function loadPendingStore(filePath: string): PendingStore {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return isPendingStore(parsed) ? parsed : EMPTY_STORE
  } catch {
    return EMPTY_STORE
  }
}

export function savePendingStore(filePath: string, store: PendingStore): void {
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2))
}

export function ensurePendingStoreFile(filePath: string): void {
  if (fs.existsSync(filePath)) return
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(EMPTY_STORE, null, 2))
}

export function isBlocked(store: PendingStore, kind: 'user' | 'chat', id: number): boolean {
  return store.blocked.some((b) => b.kind === kind && b.id === id)
}

function isPending(store: PendingStore, kind: 'user' | 'chat', id: number): boolean {
  return store.pending.some((p) => p.kind === kind && p.id === id)
}

export function addPending(store: PendingStore, entry: PendingEntry): PendingStore {
  if (isBlocked(store, entry.kind, entry.id) || isPending(store, entry.kind, entry.id)) return store
  return { ...store, pending: [...store.pending, entry] }
}

export function removePending(store: PendingStore, kind: 'user' | 'chat', id: number): PendingStore {
  if (!isPending(store, kind, id)) return store
  return { ...store, pending: store.pending.filter((p) => !(p.kind === kind && p.id === id)) }
}

export function addBlocked(store: PendingStore, kind: 'user' | 'chat', id: number): PendingStore {
  if (isBlocked(store, kind, id)) return store
  return { ...store, blocked: [...store.blocked, { kind, id }] }
}
