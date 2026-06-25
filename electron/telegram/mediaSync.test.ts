import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  addPendingMedia,
  ensureMediaSyncStateFile,
  getPending,
  loadMediaSyncState,
  markDone,
  saveMediaSyncState,
  type MediaEntry,
  type MediaSyncState,
} from './mediaSync'

const entry: MediaEntry = { fileId: 42, chatId: -1001, messageId: 7, status: 'pending' }

describe('addPendingMedia', () => {
  it('ajoute une nouvelle entrée pending', () => {
    const state: MediaSyncState = { entries: [] }
    expect(addPendingMedia(state, { fileId: 42, chatId: -1001, messageId: 7 })).toEqual({ entries: [entry] })
  })

  it('dédup par fileId (no-op si déjà présent, même via un autre message)', () => {
    const state: MediaSyncState = { entries: [entry] }
    expect(addPendingMedia(state, { fileId: 42, chatId: -2002, messageId: 99 })).toBe(state)
  })
})

describe('markDone', () => {
  it('marque une entrée pending comme done', () => {
    const state: MediaSyncState = { entries: [entry] }
    expect(markDone(state, 42)).toEqual({ entries: [{ ...entry, status: 'done' }] })
  })

  it('no-op si le fileId est inconnu', () => {
    const state: MediaSyncState = { entries: [] }
    expect(markDone(state, 42)).toBe(state)
  })

  it('no-op si déjà done', () => {
    const state: MediaSyncState = { entries: [{ ...entry, status: 'done' }] }
    expect(markDone(state, 42)).toBe(state)
  })
})

describe('getPending', () => {
  it('ne retourne que les entrées pending', () => {
    const state: MediaSyncState = { entries: [entry, { ...entry, fileId: 43, status: 'done' }] }
    expect(getPending(state)).toEqual([entry])
  })
})

describe('loadMediaSyncState', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minigram-media-sync-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('charge un media-sync.json valide', () => {
    const filePath = path.join(tmpDir, 'media-sync.json')
    const state: MediaSyncState = { entries: [entry] }
    fs.writeFileSync(filePath, JSON.stringify(state))
    expect(loadMediaSyncState(filePath)).toEqual(state)
  })

  it('retombe sur un état vide si le fichier est absent', () => {
    expect(loadMediaSyncState(path.join(tmpDir, 'does-not-exist.json'))).toEqual({ entries: [] })
  })

  it('retombe sur un état vide si le JSON est invalide', () => {
    const filePath = path.join(tmpDir, 'broken.json')
    fs.writeFileSync(filePath, '{ not valid json')
    expect(loadMediaSyncState(filePath)).toEqual({ entries: [] })
  })

  it('retombe sur un état vide si la forme du JSON est incorrecte', () => {
    const filePath = path.join(tmpDir, 'wrong-shape.json')
    fs.writeFileSync(filePath, JSON.stringify({ entries: [{ fileId: 42 }] }))
    expect(loadMediaSyncState(filePath)).toEqual({ entries: [] })
  })

  it('round-trip avec saveMediaSyncState', () => {
    const filePath = path.join(tmpDir, 'media-sync.json')
    const state: MediaSyncState = { entries: [entry] }
    saveMediaSyncState(filePath, state)
    expect(loadMediaSyncState(filePath)).toEqual(state)
  })
})

describe('ensureMediaSyncStateFile', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minigram-ensure-media-sync-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('crée le fichier avec un état vide si absent', () => {
    const filePath = path.join(tmpDir, 'sub', 'media-sync.json')
    ensureMediaSyncStateFile(filePath)
    expect(fs.existsSync(filePath)).toBe(true)
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual({ entries: [] })
  })

  it('ne touche pas un fichier déjà existant', () => {
    const filePath = path.join(tmpDir, 'media-sync.json')
    const state: MediaSyncState = { entries: [entry] }
    fs.writeFileSync(filePath, JSON.stringify(state))
    ensureMediaSyncStateFile(filePath)
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual(state)
  })
})
