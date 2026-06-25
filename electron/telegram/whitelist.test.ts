import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  addChatToWhitelist,
  addUserToWhitelist,
  ensureWhitelistFile,
  isChatAllowed,
  isUserAllowed,
  loadWhitelist,
} from './whitelist'

describe('isChatAllowed / isUserAllowed', () => {
  const whitelist = { allowed_user_ids: [111], allowed_chat_ids: [-1001] }

  it('autorise un chat présent dans la whitelist', () => {
    expect(isChatAllowed(whitelist, -1001)).toBe(true)
  })

  it("refuse un chat absent de la whitelist", () => {
    expect(isChatAllowed(whitelist, -9999)).toBe(false)
  })

  it('autorise un user présent dans la whitelist', () => {
    expect(isUserAllowed(whitelist, 111)).toBe(true)
  })

  it("refuse un user absent de la whitelist", () => {
    expect(isUserAllowed(whitelist, 222)).toBe(false)
  })

  it('refuse tout sur une whitelist vide', () => {
    const empty = { allowed_user_ids: [], allowed_chat_ids: [] }
    expect(isChatAllowed(empty, -1001)).toBe(false)
    expect(isUserAllowed(empty, 111)).toBe(false)
  })
})

describe('addUserToWhitelist / addChatToWhitelist', () => {
  it('ajoute un user absent', () => {
    const whitelist = { allowed_user_ids: [1], allowed_chat_ids: [] }
    expect(addUserToWhitelist(whitelist, 2)).toEqual({ allowed_user_ids: [1, 2], allowed_chat_ids: [] })
  })

  it('ne duplique pas un user déjà présent (no-op)', () => {
    const whitelist = { allowed_user_ids: [1], allowed_chat_ids: [] }
    expect(addUserToWhitelist(whitelist, 1)).toBe(whitelist)
  })

  it('ajoute un chat absent', () => {
    const whitelist = { allowed_user_ids: [], allowed_chat_ids: [-1001] }
    expect(addChatToWhitelist(whitelist, -2002)).toEqual({ allowed_user_ids: [], allowed_chat_ids: [-1001, -2002] })
  })

  it('ne duplique pas un chat déjà présent (no-op)', () => {
    const whitelist = { allowed_user_ids: [], allowed_chat_ids: [-1001] }
    expect(addChatToWhitelist(whitelist, -1001)).toBe(whitelist)
  })

  it("n'altère pas l'objet d'entrée", () => {
    const whitelist = { allowed_user_ids: [1], allowed_chat_ids: [-1001] }
    addUserToWhitelist(whitelist, 2)
    addChatToWhitelist(whitelist, -2002)
    expect(whitelist).toEqual({ allowed_user_ids: [1], allowed_chat_ids: [-1001] })
  })
})

describe('loadWhitelist', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minigram-whitelist-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('charge un whitelist.json valide', () => {
    const filePath = path.join(tmpDir, 'whitelist.json')
    fs.writeFileSync(filePath, JSON.stringify({ allowed_user_ids: [1], allowed_chat_ids: [2] }))
    expect(loadWhitelist(filePath)).toEqual({ allowed_user_ids: [1], allowed_chat_ids: [2] })
  })

  it('retombe sur une whitelist vide si le fichier est absent', () => {
    const filePath = path.join(tmpDir, 'does-not-exist.json')
    expect(loadWhitelist(filePath)).toEqual({ allowed_user_ids: [], allowed_chat_ids: [] })
  })

  it('retombe sur une whitelist vide si le JSON est invalide', () => {
    const filePath = path.join(tmpDir, 'broken.json')
    fs.writeFileSync(filePath, '{ not valid json')
    expect(loadWhitelist(filePath)).toEqual({ allowed_user_ids: [], allowed_chat_ids: [] })
  })

  it('retombe sur une whitelist vide si la forme du JSON est incorrecte', () => {
    const filePath = path.join(tmpDir, 'wrong-shape.json')
    fs.writeFileSync(filePath, JSON.stringify({ foo: 'bar' }))
    expect(loadWhitelist(filePath)).toEqual({ allowed_user_ids: [], allowed_chat_ids: [] })
  })
})

describe('ensureWhitelistFile', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minigram-ensure-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('crée le fichier avec un placeholder vide si absent', () => {
    const filePath = path.join(tmpDir, 'sub', 'whitelist.json')
    ensureWhitelistFile(filePath)
    expect(fs.existsSync(filePath)).toBe(true)
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual({
      allowed_user_ids: [],
      allowed_chat_ids: [],
    })
  })

  it('ne touche pas un fichier déjà existant', () => {
    const filePath = path.join(tmpDir, 'whitelist.json')
    fs.writeFileSync(filePath, JSON.stringify({ allowed_user_ids: [42], allowed_chat_ids: [] }))
    ensureWhitelistFile(filePath)
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual({
      allowed_user_ids: [42],
      allowed_chat_ids: [],
    })
  })
})
