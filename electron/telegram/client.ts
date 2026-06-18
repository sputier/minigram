import path from 'node:path'
import { app } from 'electron'
import * as tdl from 'tdl'
import type { LoginUser } from 'tdl'
import { getTdjson } from 'prebuilt-tdlib'
import { ensureWhitelistFile, loadWhitelist, isChatAllowed, type Whitelist } from './whitelist'
import { isChatObjectAllowed, mapChat, mapMessage, mapUpdate, type MappedUpdate, type TdChat, type TdMessage, type TdUpdate, type UiChat, type UiMessage } from './mapUpdate'

tdl.configure({ tdjson: getTdjson() })

export type AuthState =
  | { step: 'idle' }
  | { step: 'phone'; retry: boolean }
  | { step: 'code'; retry: boolean }
  | { step: 'password'; hint: string; retry: boolean }
  | { step: 'ready' }
  | { step: 'error'; message: string }

interface Deferred<T> {
  resolve: (value: T) => void
  reject: (err: unknown) => void
}

type TdlClient = ReturnType<typeof tdl.createClient>

let client: TdlClient | null = null
let whitelist: Whitelist = { allowed_user_ids: [], allowed_chat_ids: [] }
let whitelistPath = ''
let allowedChatIdsCache = new Set<number>()

let pendingPhone: Deferred<string> | null = null
let pendingCode: Deferred<string> | null = null
let pendingPassword: Deferred<string> | null = null

let onAuthStateChange: (state: AuthState) => void = () => {}
let onMappedUpdate: (update: MappedUpdate) => void = () => {}

export interface StartClientOptions {
  apiId: number
  apiHash: string
  databaseEncryptionKey: string
  onAuthState: (state: AuthState) => void
  onUpdate: (update: MappedUpdate) => void
}

export function startClient(options: StartClientOptions): void {
  onAuthStateChange = options.onAuthState
  onMappedUpdate = options.onUpdate

  whitelistPath = path.join(app.getPath('userData'), 'whitelist.json')
  ensureWhitelistFile(whitelistPath)
  whitelist = loadWhitelist(whitelistPath)

  if (!options.apiId || !options.apiHash || !options.databaseEncryptionKey) {
    console.error(
      '[telegram] TELEGRAM_API_ID / TELEGRAM_API_HASH / TDLIB_ENCRYPTION_KEY manquants ou invalides ' +
        'dans .env — le client TDLib ne sera pas démarré. Copie .env.example vers .env et renseigne ' +
        'tes clés (https://my.telegram.org/) ainsi qu\'une clé de chiffrement.',
    )
    onAuthStateChange({
      step: 'error',
      message: 'Configuration .env manquante (TELEGRAM_API_ID / TELEGRAM_API_HASH / TDLIB_ENCRYPTION_KEY)',
    })
    return
  }

  client = tdl.createClient({
    apiId: options.apiId,
    apiHash: options.apiHash,
    databaseDirectory: path.join(app.getPath('userData'), 'td_db'),
    filesDirectory: path.join(app.getPath('userData'), 'td_files'),
    databaseEncryptionKey: options.databaseEncryptionKey,
  })

  client.on('error', (err) => {
    console.error('[telegram] erreur client tdl', err)
    onAuthStateChange({ step: 'error', message: err.message })
  })

  client.on('update', (update) => {
    const raw = update as unknown as TdUpdate & { authorization_state?: { _: string } }

    if (raw._ === 'updateAuthorizationState') {
      handleAuthorizationState(raw.authorization_state?._)
      return
    }

    // La whitelist peut être éditée par le parent pendant que l'app tourne.
    whitelist = loadWhitelist(whitelistPath)

    const mapped = mapUpdate(raw, whitelist)
    if (mapped) onMappedUpdate(mapped)
  })
}

function handleAuthorizationState(state: string | undefined): void {
  if (state === 'authorizationStateReady') {
    onAuthStateChange({ step: 'ready' })
  } else if (state === 'authorizationStateClosed') {
    onAuthStateChange({ step: 'error', message: 'Session Telegram fermée' })
  }
}

export function startLogin(): void {
  if (!client) return

  const loginDetails: Partial<LoginUser> = {
    getPhoneNumber: (retry) =>
      new Promise<string>((resolve, reject) => {
        pendingPhone = { resolve, reject }
        onAuthStateChange({ step: 'phone', retry: Boolean(retry) })
      }),
    getAuthCode: (retry) =>
      new Promise<string>((resolve, reject) => {
        pendingCode = { resolve, reject }
        onAuthStateChange({ step: 'code', retry: Boolean(retry) })
      }),
    getPassword: (hint, retry) =>
      new Promise<string>((resolve, reject) => {
        pendingPassword = { resolve, reject }
        onAuthStateChange({ step: 'password', hint, retry: Boolean(retry) })
      }),
  }

  client
    .login(loginDetails)
    .then(() => onAuthStateChange({ step: 'ready' }))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Erreur de connexion Telegram'
      console.error('[telegram] login échoué', err)
      onAuthStateChange({ step: 'error', message })
    })
}

export function submitPhoneNumber(phone: string): void {
  pendingPhone?.resolve(phone)
  pendingPhone = null
}

export function submitAuthCode(code: string): void {
  pendingCode?.resolve(code)
  pendingCode = null
}

export function submitAuthPassword(password: string): void {
  pendingPassword?.resolve(password)
  pendingPassword = null
}

export async function getChats(): Promise<UiChat[]> {
  if (!client) return []
  whitelist = loadWhitelist(whitelistPath)

  const result = await client.invoke({ _: 'getChats', chat_list: { _: 'chatListMain' }, limit: 200 })

  const tdChats: TdChat[] = []
  for (const chatId of result.chat_ids) {
    const chat = (await client.invoke({ _: 'getChat', chat_id: chatId })) as unknown as TdChat
    if (isChatObjectAllowed(chat, whitelist)) tdChats.push(chat)
  }

  tdChats.sort((a, b) => (b.last_message?.date ?? 0) - (a.last_message?.date ?? 0))
  allowedChatIdsCache = new Set(tdChats.map((c) => c.id))

  return tdChats.map(mapChat)
}

export async function getHistory(chatId: number): Promise<UiMessage[]> {
  if (!client || !allowedChatIdsCache.has(chatId)) return []

  const result = await client.invoke({ _: 'getChatHistory', chat_id: chatId, limit: 50 })
  const messages = result.messages.filter((m) => m !== null) as unknown as TdMessage[]

  return messages.map(mapMessage).reverse()
}

export async function sendMessage(chatId: number, text: string): Promise<void> {
  if (!client) throw new Error('Client Telegram non initialisé')
  if (!allowedChatIdsCache.has(chatId) && !isChatAllowed(whitelist, chatId)) {
    throw new Error('Chat non autorisé')
  }

  await client.invoke({
    _: 'sendMessage',
    chat_id: chatId,
    input_message_content: {
      _: 'inputMessageText',
      text: { _: 'formattedText', text, entities: [] },
    },
  })
}
