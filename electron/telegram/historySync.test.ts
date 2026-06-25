import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  ensureSyncStateFile,
  getProgress,
  loadSyncState,
  saveSyncState,
  upsertProgress,
  type ChatSyncProgress,
  type SyncState,
} from './historySync'

const progress: ChatSyncProgress = { chatId: -1001, oldestMessageId: 500, complete: false }

describe('getProgress', () => {
  it('retrouve le progrès existant pour un chat', () => {
    const state: SyncState = { chats: [progress] }
    expect(getProgress(state, -1001)).toEqual(progress)
  })

  it('retourne undefined si le chat est inconnu', () => {
    const state: SyncState = { chats: [] }
    expect(getProgress(state, -1001)).toBeUndefined()
  })
})

describe('upsertProgress', () => {
  it('ajoute un nouveau progrès', () => {
    const state: SyncState = { chats: [] }
    expect(upsertProgress(state, progress)).toEqual({ chats: [progress] })
  })

  it('met à jour un progrès existant', () => {
    const state: SyncState = { chats: [progress] }
    const updated = { ...progress, oldestMessageId: 100 }
    expect(upsertProgress(state, updated)).toEqual({ chats: [updated] })
  })

  it('no-op si rien ne change (même référence)', () => {
    const state: SyncState = { chats: [progress] }
    expect(upsertProgress(state, { ...progress })).toBe(state)
  })

  it("n'altère pas l'objet d'entrée", () => {
    const state: SyncState = { chats: [progress] }
    upsertProgress(state, { ...progress, oldestMessageId: 1 })
    expect(state).toEqual({ chats: [progress] })
  })
})

describe('loadSyncState', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minigram-history-sync-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('charge un history-sync.json valide', () => {
    const filePath = path.join(tmpDir, 'history-sync.json')
    const state: SyncState = { chats: [progress] }
    fs.writeFileSync(filePath, JSON.stringify(state))
    expect(loadSyncState(filePath)).toEqual(state)
  })

  it('retombe sur un état vide si le fichier est absent', () => {
    const filePath = path.join(tmpDir, 'does-not-exist.json')
    expect(loadSyncState(filePath)).toEqual({ chats: [] })
  })

  it('retombe sur un état vide si le JSON est invalide', () => {
    const filePath = path.join(tmpDir, 'broken.json')
    fs.writeFileSync(filePath, '{ not valid json')
    expect(loadSyncState(filePath)).toEqual({ chats: [] })
  })

  it('retombe sur un état vide si la forme du JSON est incorrecte', () => {
    const filePath = path.join(tmpDir, 'wrong-shape.json')
    fs.writeFileSync(filePath, JSON.stringify({ chats: [{ chatId: -1001 }] }))
    expect(loadSyncState(filePath)).toEqual({ chats: [] })
  })

  it('round-trip avec saveSyncState', () => {
    const filePath = path.join(tmpDir, 'history-sync.json')
    const state: SyncState = { chats: [progress] }
    saveSyncState(filePath, state)
    expect(loadSyncState(filePath)).toEqual(state)
  })
})

describe('ensureSyncStateFile', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minigram-ensure-history-sync-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('crée le fichier avec un état vide si absent', () => {
    const filePath = path.join(tmpDir, 'sub', 'history-sync.json')
    ensureSyncStateFile(filePath)
    expect(fs.existsSync(filePath)).toBe(true)
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual({ chats: [] })
  })

  it('ne touche pas un fichier déjà existant', () => {
    const filePath = path.join(tmpDir, 'history-sync.json')
    const state: SyncState = { chats: [progress] }
    fs.writeFileSync(filePath, JSON.stringify(state))
    ensureSyncStateFile(filePath)
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual(state)
  })
})
