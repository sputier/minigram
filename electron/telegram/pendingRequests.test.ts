import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  addBlocked,
  addPending,
  ensurePendingStoreFile,
  isBlocked,
  loadPendingStore,
  removePending,
  savePendingStore,
  type PendingEntry,
  type PendingStore,
} from './pendingRequests'

const entry: PendingEntry = { kind: 'user', id: 111, name: 'Inconnu', preview: 'Salut', firstSeen: 1_700_000_000 }

describe('addPending', () => {
  it('ajoute une entrée à un store vide', () => {
    const store: PendingStore = { pending: [], blocked: [] }
    expect(addPending(store, entry)).toEqual({ pending: [entry], blocked: [] })
  })

  it('dédup : ajouter deux fois le même (kind, id) ne crée qu\'une entrée (no-op)', () => {
    const store: PendingStore = { pending: [entry], blocked: [] }
    expect(addPending(store, { ...entry, preview: 'Autre message' })).toBe(store)
  })

  it('refuse d\'ajouter une entrée déjà bloquée', () => {
    const store: PendingStore = { pending: [], blocked: [{ kind: 'user', id: 111 }] }
    expect(addPending(store, entry)).toBe(store)
  })
})

describe('removePending', () => {
  it('retire une entrée présente', () => {
    const store: PendingStore = { pending: [entry], blocked: [] }
    expect(removePending(store, 'user', 111)).toEqual({ pending: [], blocked: [] })
  })

  it('no-op si l\'id est absent', () => {
    const store: PendingStore = { pending: [], blocked: [] }
    expect(removePending(store, 'user', 111)).toBe(store)
  })
})

describe('addBlocked / isBlocked', () => {
  it('ajoute une nouvelle entrée bloquée', () => {
    const store: PendingStore = { pending: [], blocked: [] }
    expect(addBlocked(store, 'user', 111)).toEqual({ pending: [], blocked: [{ kind: 'user', id: 111 }] })
  })

  it('dédup : bloquer deux fois le même (kind, id) (no-op)', () => {
    const store: PendingStore = { pending: [], blocked: [{ kind: 'user', id: 111 }] }
    expect(addBlocked(store, 'user', 111)).toBe(store)
  })

  it('isBlocked détecte correctement présent/absent', () => {
    const store: PendingStore = { pending: [], blocked: [{ kind: 'chat', id: -1001 }] }
    expect(isBlocked(store, 'chat', -1001)).toBe(true)
    expect(isBlocked(store, 'user', -1001)).toBe(false)
  })
})

describe('loadPendingStore', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minigram-pending-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('charge un pending-chats.json valide', () => {
    const filePath = path.join(tmpDir, 'pending-chats.json')
    const store: PendingStore = { pending: [entry], blocked: [{ kind: 'chat', id: -1001 }] }
    fs.writeFileSync(filePath, JSON.stringify(store))
    expect(loadPendingStore(filePath)).toEqual(store)
  })

  it('retombe sur un store vide si le fichier est absent', () => {
    const filePath = path.join(tmpDir, 'does-not-exist.json')
    expect(loadPendingStore(filePath)).toEqual({ pending: [], blocked: [] })
  })

  it('retombe sur un store vide si le JSON est invalide', () => {
    const filePath = path.join(tmpDir, 'broken.json')
    fs.writeFileSync(filePath, '{ not valid json')
    expect(loadPendingStore(filePath)).toEqual({ pending: [], blocked: [] })
  })

  it('retombe sur un store vide si la forme du JSON est incorrecte', () => {
    const filePath = path.join(tmpDir, 'wrong-shape.json')
    fs.writeFileSync(filePath, JSON.stringify({ pending: [{ kind: 'user' }], blocked: [] }))
    expect(loadPendingStore(filePath)).toEqual({ pending: [], blocked: [] })
  })

  it('round-trip avec savePendingStore', () => {
    const filePath = path.join(tmpDir, 'pending-chats.json')
    const store: PendingStore = { pending: [entry], blocked: [] }
    savePendingStore(filePath, store)
    expect(loadPendingStore(filePath)).toEqual(store)
  })
})

describe('ensurePendingStoreFile', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minigram-ensure-pending-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('crée le fichier avec un store vide si absent', () => {
    const filePath = path.join(tmpDir, 'sub', 'pending-chats.json')
    ensurePendingStoreFile(filePath)
    expect(fs.existsSync(filePath)).toBe(true)
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual({ pending: [], blocked: [] })
  })

  it('ne touche pas un fichier déjà existant', () => {
    const filePath = path.join(tmpDir, 'pending-chats.json')
    const store: PendingStore = { pending: [entry], blocked: [] }
    fs.writeFileSync(filePath, JSON.stringify(store))
    ensurePendingStoreFile(filePath)
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual(store)
  })
})
