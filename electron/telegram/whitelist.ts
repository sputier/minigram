import fs from 'node:fs'
import path from 'node:path'

export interface Whitelist {
  allowed_user_ids: number[]
  allowed_chat_ids: number[]
}

const EMPTY_WHITELIST: Whitelist = { allowed_user_ids: [], allowed_chat_ids: [] }

function isWhitelist(value: unknown): value is Whitelist {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    Array.isArray(v.allowed_user_ids) &&
    v.allowed_user_ids.every((id) => typeof id === 'number') &&
    Array.isArray(v.allowed_chat_ids) &&
    v.allowed_chat_ids.every((id) => typeof id === 'number')
  )
}

// Ne throw jamais : un whitelist.json absent/corrompu doit fermer l'accès,
// pas faire planter l'app ni l'ouvrir par défaut.
export function loadWhitelist(filePath: string): Whitelist {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return isWhitelist(parsed) ? parsed : EMPTY_WHITELIST
  } catch {
    return EMPTY_WHITELIST
  }
}

export function isChatAllowed(whitelist: Whitelist, chatId: number): boolean {
  return whitelist.allowed_chat_ids.includes(chatId)
}

export function isUserAllowed(whitelist: Whitelist, userId: number): boolean {
  return whitelist.allowed_user_ids.includes(userId)
}

export function ensureWhitelistFile(filePath: string): void {
  if (fs.existsSync(filePath)) return
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(EMPTY_WHITELIST, null, 2))
}

export function saveWhitelist(filePath: string, whitelist: Whitelist): void {
  fs.writeFileSync(filePath, JSON.stringify(whitelist, null, 2))
}

export function addUserToWhitelist(whitelist: Whitelist, userId: number): Whitelist {
  if (whitelist.allowed_user_ids.includes(userId)) return whitelist
  return { ...whitelist, allowed_user_ids: [...whitelist.allowed_user_ids, userId] }
}

export function addChatToWhitelist(whitelist: Whitelist, chatId: number): Whitelist {
  if (whitelist.allowed_chat_ids.includes(chatId)) return whitelist
  return { ...whitelist, allowed_chat_ids: [...whitelist.allowed_chat_ids, chatId] }
}
