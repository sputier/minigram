import path from 'node:path'
import { app } from 'electron'
import * as tdl from 'tdl'
import type { LoginUser } from 'tdl'
import { getTdjson } from 'prebuilt-tdlib'
import {
  addChatToWhitelist,
  addUserToWhitelist,
  ensureWhitelistFile,
  loadWhitelist,
  isChatAllowed,
  isUserAllowed,
  saveWhitelist,
  type Whitelist,
} from './whitelist'
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
import {
  extractPendingCandidate,
  isChatObjectAllowed,
  mapChat,
  mapMessage,
  mapUpdate,
  mapUser,
  type MappedUpdate,
  type PendingCandidate,
  type TdChat,
  type TdMessage,
  type TdUpdate,
  type TdUser,
  type UiChat,
  type UiMessage,
  type UiSelf,
} from './mapUpdate'

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

let pendingStore: PendingStore = { pending: [], blocked: [] }
let pendingStorePath = ''

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

  pendingStorePath = path.join(app.getPath('userData'), 'pending-chats.json')
  ensurePendingStoreFile(pendingStorePath)
  pendingStore = loadPendingStore(pendingStorePath)

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
    // L'interface JSON de TDLib attend ce champ "bytes" en base64 ; une
    // passphrase texte brute fait échouer setTdlibParameters avec
    // "Wrong padding length". On encode ici pour que .env reste une simple
    // phrase de passe lisible par le parent.
    databaseEncryptionKey: Buffer.from(options.databaseEncryptionKey, 'utf-8').toString('base64'),
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

    const candidate = extractPendingCandidate(raw, whitelist)
    if (candidate) void enqueuePendingCandidate(candidate)
  })
}

function handleAuthorizationState(state: string | undefined): void {
  if (state === 'authorizationStateReady') {
    void seedWhitelistIfEmpty()
      .catch((err) => console.error('[telegram] seed whitelist échoué', err))
      .finally(() => onAuthStateChange({ step: 'ready' }))
  } else if (state === 'authorizationStateClosed') {
    onAuthStateChange({ step: 'error', message: 'Session Telegram fermée' })
  }
}

// Au tout premier démarrage (whitelist.json encore vide), les discussions
// déjà existantes au moment de la connexion sont considérées comme des
// contacts légitimes déjà ajoutés par le parent — elles sont donc autorisées
// automatiquement, sans validation manuelle. Tout ce qui arrive APRÈS reste
// soumis au flow de demande en attente (cf enqueuePendingCandidate).
async function seedWhitelistIfEmpty(): Promise<void> {
  if (!client) return
  whitelist = loadWhitelist(whitelistPath)
  if (whitelist.allowed_user_ids.length > 0 || whitelist.allowed_chat_ids.length > 0) return

  const result = await client.invoke({ _: 'getChats', chat_list: { _: 'chatListMain' }, limit: 200 })
  let seeded: Whitelist = { allowed_user_ids: [], allowed_chat_ids: [] }
  for (const chatId of result.chat_ids) {
    const chat = (await client.invoke({ _: 'getChat', chat_id: chatId })) as unknown as TdChat
    if (chat.type?._ === 'chatTypePrivate' && typeof chat.type.user_id === 'number') {
      seeded = addUserToWhitelist(seeded, chat.type.user_id)
    } else {
      seeded = addChatToWhitelist(seeded, chat.id)
    }
  }
  whitelist = seeded
  saveWhitelist(whitelistPath, whitelist)
}

// Enrichit le candidat détecté (nom réel via getUser/getChat, fallback sur
// le placeholder si l'appel échoue) puis le persiste — fire-and-forget,
// appelé depuis le handler synchrone d'updates.
async function enqueuePendingCandidate(candidate: PendingCandidate): Promise<void> {
  if (!client) return

  // Recharge la whitelist la plus fraîche : entre la détection (synchrone,
  // au moment de l'update) et cet appel async, le seed initial peut avoir
  // fini d'écrire whitelist.json — il ne faut pas mettre en attente un id
  // devenu entre-temps légitimement autorisé.
  whitelist = loadWhitelist(whitelistPath)
  const nowAllowed =
    candidate.kind === 'user' ? isUserAllowed(whitelist, candidate.id) : isChatAllowed(whitelist, candidate.id)
  if (nowAllowed) return

  pendingStore = loadPendingStore(pendingStorePath)
  if (isBlocked(pendingStore, candidate.kind, candidate.id)) return

  let name = candidate.name
  try {
    if (candidate.kind === 'user') {
      const user = (await client.invoke({ _: 'getUser', user_id: candidate.id })) as unknown as TdUser
      name = mapUser(user).name
    } else {
      const chat = (await client.invoke({ _: 'getChat', chat_id: candidate.id })) as unknown as TdChat
      name = chat.title || name
    }
  } catch {
    // Garde le placeholder si le lookup échoue — n'empêche pas la mise en attente.
  }

  const entry: PendingEntry = { ...candidate, name, firstSeen: Math.floor(Date.now() / 1000) }
  const updated = addPending(pendingStore, entry)
  if (updated !== pendingStore) {
    pendingStore = updated
    savePendingStore(pendingStorePath, pendingStore)
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

export async function getMe(): Promise<UiSelf | null> {
  if (!client) return null
  const me = (await client.invoke({ _: 'getMe' })) as unknown as TdUser
  return mapUser(me)
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

export function getPendingRequests(): PendingEntry[] {
  pendingStore = loadPendingStore(pendingStorePath)
  return pendingStore.pending
}

export function approvePending(kind: 'user' | 'chat', id: number): void {
  pendingStore = loadPendingStore(pendingStorePath)
  whitelist = loadWhitelist(whitelistPath)

  whitelist = kind === 'user' ? addUserToWhitelist(whitelist, id) : addChatToWhitelist(whitelist, id)
  saveWhitelist(whitelistPath, whitelist)

  pendingStore = removePending(pendingStore, kind, id)
  savePendingStore(pendingStorePath, pendingStore)
}

// Rejeter bloque définitivement : l'id ne redéclenchera plus jamais de
// demande, même si la même personne écrit à nouveau (décision produit
// confirmée — réversible seulement en éditant pending-chats.json à la main).
export function rejectPending(kind: 'user' | 'chat', id: number): void {
  pendingStore = loadPendingStore(pendingStorePath)
  pendingStore = removePending(pendingStore, kind, id)
  pendingStore = addBlocked(pendingStore, kind, id)
  savePendingStore(pendingStorePath, pendingStore)
}

export function addToWhitelist(kind: 'user' | 'chat', id: number): void {
  whitelist = loadWhitelist(whitelistPath)
  whitelist = kind === 'user' ? addUserToWhitelist(whitelist, id) : addChatToWhitelist(whitelist, id)
  saveWhitelist(whitelistPath, whitelist)

  // Un id whitelisté ne doit jamais rester simultanément en attente.
  pendingStore = loadPendingStore(pendingStorePath)
  pendingStore = removePending(pendingStore, kind, id)
  savePendingStore(pendingStorePath, pendingStore)
}

export interface SearchResult {
  kind: 'user' | 'chat'
  id: number
  name: string
}

// Recherche globale réservée au parent (gate admin protégé par mot de
// passe) — jamais exposée à l'enfant. Combine les contacts déjà connus du
// compte et la recherche publique Telegram.
export async function searchContacts(query: string): Promise<SearchResult[]> {
  if (!client || !query.trim()) return []

  const [contacts, publicChats] = await Promise.all([
    client.invoke({ _: 'searchContacts', query, limit: 20 }),
    client.invoke({ _: 'searchPublicChats', query }).catch(() => ({ chat_ids: [] as number[] })),
  ])

  const results: SearchResult[] = []
  for (const userId of contacts.user_ids) {
    const user = (await client.invoke({ _: 'getUser', user_id: userId })) as unknown as TdUser
    results.push({ kind: 'user', id: userId, name: mapUser(user).name })
  }
  for (const chatId of publicChats.chat_ids) {
    const chat = (await client.invoke({ _: 'getChat', chat_id: chatId })) as unknown as TdChat
    results.push({ kind: 'chat', id: chatId, name: chat.title })
  }
  return results
}
