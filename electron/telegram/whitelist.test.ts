import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureWhitelistFile, isChatAllowed, isUserAllowed, loadWhitelist } from './whitelist'

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
