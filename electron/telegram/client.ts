import path from 'node:path'
import { existsSync } from 'node:fs'
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
  ensureSyncStateFile,
  getProgress,
  loadSyncState,
  saveSyncState,
  upsertProgress,
  type SyncState,
} from './historySync'
import {
  addPendingMedia,
  ensureMediaSyncStateFile,
  getPending as getPendingMedia,
  loadMediaSyncState,
  markDone,
  saveMediaSyncState,
  type MediaSyncState,
} from './mediaSync'
import {
  colorForId,
  extractMedia,
  extractPendingCandidate,
  isChatObjectAllowed,
  mapChat,
  mapMessage,
  mapUpdate,
  mapUser,
  type MappedUpdate,
  type PendingCandidate,
  type TdChat,
  type TdFile,
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

let historySyncStatePath = ''
let historySyncQueue: number[] = []
let historySyncRunning = false

let mediaSyncStatePath = ''
let mediaSyncState: MediaSyncState = { entries: [] }
let mediaQueue: number[] = []
let mediaQueueRunning = false

let pendingPhone: Deferred<string> | null = null
let pendingCode: Deferred<string> | null = null
let pendingPassword: Deferred<string> | null = null

let onAuthStateChange: (state: AuthState) => void = () => {}
let onMappedUpdate: (update: MappedUpdate) => void = () => {}
let onMediaReady: (fileId: number) => void = () => {}
let onSyncProgressChange: (progress: SyncProgress) => void = () => {}

const chatNameCache = new Map<number, string>()

export interface SyncProgress {
  active: boolean
  mediaPending: number
  mediaDone: number
}

export interface StartClientOptions {
  apiId: number
  apiHash: string
  databaseEncryptionKey: string
  onAuthState: (state: AuthState) => void
  onUpdate: (update: MappedUpdate) => void
  onMediaReady?: (fileId: number) => void
  onSyncProgress?: (progress: SyncProgress) => void
}

export function startClient(options: StartClientOptions): void {
  onAuthStateChange = options.onAuthState
  onMappedUpdate = options.onUpdate
  onMediaReady = options.onMediaReady ?? (() => {})
  onSyncProgressChange = options.onSyncProgress ?? (() => {})

  whitelistPath = path.join(app.getPath('userData'), 'whitelist.json')
  ensureWhitelistFile(whitelistPath)
  whitelist = loadWhitelist(whitelistPath)

  pendingStorePath = path.join(app.getPath('userData'), 'pending-chats.json')
  ensurePendingStoreFile(pendingStorePath)
  pendingStore = loadPendingStore(pendingStorePath)

  historySyncStatePath = path.join(app.getPath('userData'), 'history-sync.json')
  ensureSyncStateFile(historySyncStatePath)

  mediaSyncStatePath = path.join(app.getPath('userData'), 'media-sync.json')
  ensureMediaSyncStateFile(mediaSyncStatePath)
  mediaSyncState = loadMediaSyncState(mediaSyncStatePath)

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

    // TDLib notifie la complétion de chaque téléchargement via updateFile,
    // indépendamment de processMediaQueue. On en profite pour notifier le
    // renderer directement, sans attendre la fin de la queue entière — ça
    // débloque l'affichage des médias haute priorité (vocaux, images visibles)
    // même si la queue est en train de télécharger un gros fichier en arrière-plan.
    if (raw._ === 'updateFile') {
      const file = (raw as { file?: TdFile }).file
      if (file?.local?.is_downloading_completed && file.local.path) {
        onMediaReady(file.id)
      }
      return
    }

    // updateChatReadInbox nécessite allowedChatIdsCache (qui couvre les
    // chats privés via user_id) — traité ici pour éviter de l'exposer dans
    // mapUpdate, qui ne doit pas connaître ce cache.
    if (raw._ === 'updateChatReadInbox') {
      const chatId = (raw as any).chat_id
      if (typeof chatId === 'number' && allowedChatIdsCache.has(chatId)) {
        onMappedUpdate({
          kind: 'chat-read-inbox',
          chatId,
          lastReadInboxMessageId: (raw as any).last_read_inbox_message_id ?? 0,
          unreadCount: (raw as any).unread_count ?? 0,
        })
      }
      return
    }

    // La whitelist peut être éditée par le parent pendant que l'app tourne.
    whitelist = loadWhitelist(whitelistPath)

    const mapped = mapUpdate(raw, whitelist)
    if (mapped) {
      onMappedUpdate(mapped)
      if (mapped.kind === 'new-message') {
        const message = (raw as { message?: TdMessage }).message
        if (message) enqueueMediaForMessage(message, true)
      }
    }

    const candidate = extractPendingCandidate(raw, whitelist)
    if (candidate) void enqueuePendingCandidate(candidate)
  })
}

function handleAuthorizationState(state: string | undefined): void {
  if (state === 'authorizationStateReady') {
    void seedWhitelistIfEmpty()
      .catch((err) => console.error('[telegram] seed whitelist échoué', err))
      .finally(() => {
        resumePendingMediaDownloads()
        onAuthStateChange({ step: 'ready' })
      })
  } else if (state === 'authorizationStateClosed') {
    onAuthStateChange({ step: 'error', message: 'Session Telegram fermée' })
  }
}

// Au tout premier démarrage (whitelist.json encore vide), les discussions
// déjà existantes au moment de la connexion sont considérées comme des
// contacts légitimes déjà ajoutés par le parent — elles sont donc autorisées
// automatiquement, sans validation manuelle. Tout ce qui arrive APRÈS reste
// soumis au flow de demande en attente (cf enqueuePendingCandidate).
// Récupère les user_ids des membres d'un groupe (basic ou super), sans I/O.
async function fetchGroupMemberIds(chat: TdChat): Promise<number[]> {
  if (!client) return []
  try {
    if (chat.type?._ === 'chatTypeBasicGroup' && typeof chat.type.basic_group_id === 'number') {
      const info = (await client.invoke({ _: 'getBasicGroupFullInfo', basic_group_id: chat.type.basic_group_id })) as any
      return ((info.members ?? []) as any[])
        .filter((m: any) => m.member_id?._ === 'messageSenderUser' && typeof m.member_id.user_id === 'number')
        .map((m: any) => m.member_id.user_id as number)
    }
    if (chat.type?._ === 'chatTypeSupergroup' && typeof chat.type.supergroup_id === 'number') {
      const result = (await client.invoke({ _: 'getSupergroupMembers', supergroup_id: chat.type.supergroup_id, filter: { _: 'supergroupMembersFilterRecent' }, offset: 0, limit: 200 })) as any
      return ((result.members ?? []) as any[])
        .filter((m: any) => m.member_id?._ === 'messageSenderUser' && typeof m.member_id.user_id === 'number')
        .map((m: any) => m.member_id.user_id as number)
    }
  } catch (err) {
    console.error('[telegram] fetchGroupMemberIds échoué', err)
  }
  return []
}

// Ajoute les membres d'un groupe à allowed_user_ids — fire-and-forget safe.
async function whitelistGroupMembers(chatId: number): Promise<void> {
  if (!client) return
  try {
    const chat = (await client.invoke({ _: 'getChat', chat_id: chatId })) as unknown as TdChat
    const memberIds = await fetchGroupMemberIds(chat)
    if (memberIds.length === 0) return
    whitelist = loadWhitelist(whitelistPath)
    for (const uid of memberIds) {
      whitelist = addUserToWhitelist(whitelist, uid)
    }
    saveWhitelist(whitelistPath, whitelist)
  } catch (err) {
    console.error('[telegram] whitelistGroupMembers échoué pour', chatId, err)
  }
}

async function seedWhitelistIfEmpty(): Promise<void> {
  if (!client) return
  whitelist = loadWhitelist(whitelistPath)
  if (whitelist.allowed_user_ids.length > 0 || whitelist.allowed_chat_ids.length > 0) return

  const result = await client.invoke({ _: 'getChats', chat_list: { _: 'chatListMain' }, limit: 200 })
  let seeded: Whitelist = { allowed_user_ids: [], allowed_chat_ids: [] }
  const groupChatIds: number[] = []
  for (const chatId of result.chat_ids) {
    const chat = (await client.invoke({ _: 'getChat', chat_id: chatId })) as unknown as TdChat
    if (chat.type?._ === 'chatTypePrivate' && typeof chat.type.user_id === 'number') {
      seeded = addUserToWhitelist(seeded, chat.type.user_id)
    } else {
      seeded = addChatToWhitelist(seeded, chat.id)
      if (chat.type?._ === 'chatTypeBasicGroup' || chat.type?._ === 'chatTypeSupergroup') {
        groupChatIds.push(chat.id)
      }
    }
  }
  whitelist = seeded
  saveWhitelist(whitelistPath, whitelist)

  // Auto-whitelist des membres de chaque groupe seedé.
  for (const groupId of groupChatIds) {
    await whitelistGroupMembers(groupId)
  }
}

function emitSyncProgress(): void {
  const pending = mediaSyncState.entries.filter((e) => e.status === 'pending').length
  const done = mediaSyncState.entries.length - pending
  onSyncProgressChange({ active: historySyncRunning || mediaQueueRunning, mediaPending: pending, mediaDone: done })
}

// File de fond qui télécharge l'historique COMPLET de chaque chat autorisé,
// indépendamment de ce que l'utilisateur ouvre. Idempotent : un chat déjà
// marqué complete est ignoré immédiatement, donc ré-enqueuer sans arrêt
// (ex. à chaque getChats()) ne coûte rien.
function enqueueHistorySync(chatIds: number[]): void {
  for (const id of chatIds) {
    if (!historySyncQueue.includes(id)) historySyncQueue.push(id)
  }
  if (!historySyncRunning) void processHistorySyncQueue()
}

async function processHistorySyncQueue(): Promise<void> {
  historySyncRunning = true
  emitSyncProgress()
  while (historySyncQueue.length > 0) {
    const chatId = historySyncQueue.shift()!
    try {
      await syncChatHistory(chatId)
    } catch (err) {
      console.error('[telegram] sync historique échoué pour le chat', chatId, err)
    }
  }
  historySyncRunning = false
  emitSyncProgress()
}

// Pagine vers le passé jusqu'à épuisement (aucune limite de profondeur,
// décision produit confirmée). La progression (oldestMessageId) est
// persistée après CHAQUE batch, pas seulement à la fin : si l'app est
// fermée en cours de route, on reprend exactement là où on s'est arrêté
// au prochain démarrage plutôt que de tout recommencer.
async function syncChatHistory(chatId: number): Promise<void> {
  let state = loadSyncState(historySyncStatePath)
  let progress = getProgress(state, chatId) ?? { chatId, oldestMessageId: 0, complete: false }
  if (progress.complete) return

  while (!progress.complete) {
    if (!client) return

    const result = await client.invoke({
      _: 'getChatHistory',
      chat_id: chatId,
      from_message_id: progress.oldestMessageId,
      offset: 0,
      limit: 100,
      only_local: false,
    })
    const batch = result.messages.filter((m) => m !== null) as unknown as TdMessage[]

    for (const message of batch) enqueueMediaForMessage(message)

    progress =
      batch.length === 0
        ? { ...progress, complete: true }
        : { ...progress, oldestMessageId: batch[batch.length - 1]!.id }

    state = upsertProgress(state, progress)
    saveSyncState(historySyncStatePath, state)
  }
}

// File de fond qui télécharge les fichiers (photos/vidéos/audio/documents/
// stickers/animations) référencés par les messages traités, où qu'ils
// soient découverts (affichage initial, scroll, sync complet, live).
// downloadFile est lui-même idempotent/resumable côté TDLib : ré-enqueuer un
// fichier déjà complet ou partiellement téléchargé ne coûte rien/reprend
// juste là où TDLib s'était arrêté.
// highPriority=true : place en tête de queue (messages visibles à l'écran,
// messages live). highPriority=false : en queue (sync de fond).
function enqueueMediaForMessage(message: TdMessage, highPriority = false): void {
  const media = extractMedia(message.content)
  if (!media) return

  mediaSyncState = loadMediaSyncState(mediaSyncStatePath)
  const updated = addPendingMedia(mediaSyncState, {
    fileId: media.fileId,
    chatId: message.chat_id,
    messageId: message.id,
  })
  if (updated !== mediaSyncState) {
    mediaSyncState = updated
    saveMediaSyncState(mediaSyncStatePath, mediaSyncState)
  }

  if (highPriority) {
    const idx = mediaQueue.indexOf(media.fileId)
    if (idx !== -1) mediaQueue.splice(idx, 1)
    mediaQueue.unshift(media.fileId)
  } else {
    if (!mediaQueue.includes(media.fileId)) mediaQueue.push(media.fileId)
  }
  if (!mediaQueueRunning) void processMediaQueue()
}

// Reprend au démarrage les téléchargements média laissés "pending" par une
// session précédente interrompue (app fermée avant la fin).
function resumePendingMediaDownloads(): void {
  mediaSyncState = loadMediaSyncState(mediaSyncStatePath)
  for (const entry of getPendingMedia(mediaSyncState)) {
    if (!mediaQueue.includes(entry.fileId)) mediaQueue.push(entry.fileId)
  }
  if (mediaQueue.length > 0 && !mediaQueueRunning) void processMediaQueue()
}

async function downloadMediaFile(fileId: number): Promise<void> {
  if (!client) return
  const result = (await client.invoke({
    _: 'downloadFile',
    file_id: fileId,
    priority: 32,
    offset: 0,
    limit: 0,
    synchronous: true,
  })) as unknown as TdFile
  if (!result.local?.is_downloading_completed) {
    // TDLib a résolu sans throw mais le fichier n'est pas téléchargé —
    // ce cas survient notamment quand le fichier n'est plus disponible
    // côté serveur ou que TDLib a rencontré une erreur interne.
    throw new Error(
      `TDLib: downloadFile(${fileId}) terminé mais is_downloading_completed=false (path=${result.local?.path ?? 'vide'})`,
    )
  }
}

// file_id n'est fiable que pour la durée de vie du process TDLib qui l'a
// émis : un id persisté dans media-sync.json puis réutilisé après un
// redémarrage de l'app (process TDLib différent) échoue avec "File not
// found", même si le fichier existe bel et bien côté serveur. On ne le
// traite donc que comme une clé de dédup ; avant chaque téléchargement, on
// rafraîchit le message d'origine (chatId/messageId, stables) pour obtenir
// l'identifiant de fichier valide dans la session en cours.
async function processMediaQueue(): Promise<void> {
  mediaQueueRunning = true
  emitSyncProgress()
  const retriedOnce = new Set<number>()
  while (mediaQueue.length > 0) {
    const fileId = mediaQueue.shift()!
    if (!client) break

    const entry = mediaSyncState.entries.find((e) => e.fileId === fileId)
    if (!entry) continue
    if (entry.status === 'done') {
      // Vérifie que le fichier existe vraiment sur disque. Si media-sync.json
      // a été marqué done dans une session précédente où le téléchargement a
      // échoué silencieusement, le fichier est absent et l'audio resterait
      // bloqué sur "Téléchargement en cours" sans jamais être retéléchargé.
      const existingPath = await resolveFilePath(fileId)
      if (existingPath && existsSync(existingPath)) continue
      console.warn(`[media] fileId=${fileId} marqué done mais fichier absent (path=${existingPath ?? 'null'}) — reset et re-téléchargement`)
      mediaSyncState = loadMediaSyncState(mediaSyncStatePath)
      mediaSyncState = {
        ...mediaSyncState,
        entries: mediaSyncState.entries.map((e) => (e.fileId === fileId ? { ...e, status: 'pending' } : e)),
      }
      saveMediaSyncState(mediaSyncStatePath, mediaSyncState)
    }

    try {
      const message = (await client.invoke({
        _: 'getMessage',
        chat_id: entry.chatId,
        message_id: entry.messageId,
      })) as unknown as TdMessage
      const freshMedia = extractMedia(message.content)
      const freshFileId = freshMedia?.fileId ?? fileId
      console.log(`[media] téléchargement fileId=${fileId} freshId=${freshFileId} type=${message.content?._ ?? '?'} kind=${freshMedia?.kind ?? '?'}`)

      await downloadMediaFile(freshFileId)

      mediaSyncState = loadMediaSyncState(mediaSyncStatePath)
      mediaSyncState = markDone(mediaSyncState, fileId)
      saveMediaSyncState(mediaSyncStatePath, mediaSyncState)
      onMediaReady(freshFileId)
    } catch (err) {
      console.error('[telegram] téléchargement média échoué pour le fichier', fileId, err)
      // Retry une fois en fin de queue — couvre les erreurs réseau transitoires.
      if (!retriedOnce.has(fileId)) {
        retriedOnce.add(fileId)
        mediaQueue.push(fileId)
      }
    }
    emitSyncProgress()
  }
  mediaQueueRunning = false
  emitSyncProgress()
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
  const photoId = me.profile_photo?.small?.id
  if (photoId) {
    void client
      .invoke({ _: 'downloadFile', file_id: photoId, priority: 1, offset: 0, limit: 0, synchronous: true })
      .then(() => onMediaReady(photoId))
      .catch(() => {})
  }
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
  for (const c of tdChats) chatNameCache.set(c.id, c.title)

  // Fire-and-forget : ne pas bloquer le retour de getChats() sur les photos.
  // onMediaReady notifie le renderer à chaque téléchargement terminé pour
  // déclencher un re-render des avatars.
  for (const c of tdChats) {
    const photoId = c.photo?.small?.id
    if (!photoId) continue
    void client!
      .invoke({ _: 'downloadFile', file_id: photoId, priority: 1, offset: 0, limit: 0, synchronous: true })
      .then(() => onMediaReady(photoId))
      .catch(() => {})
  }

  enqueueHistorySync(Array.from(allowedChatIdsCache))

  return tdChats.map(mapChat)
}

const HISTORY_PAGE_SIZE = 50
const HISTORY_MAX_FETCHES = 5

// TDLib documente explicitement que getChatHistory peut renvoyer moins de
// messages que la limite demandée ("the number of returned messages is
// chosen by TDLib"), surtout au premier appel sur un chat jamais consulté
// dans cette session — il faut donc relancer en paginant par
// from_message_id jusqu'à atteindre la page demandée ou une réponse vide.
// Utilisé pour l'affichage (borné, contrairement à syncChatHistory qui
// continue sans limite en arrière-plan).
async function fetchHistoryPage(chatId: number, fromMessageId: number, pageSize: number): Promise<TdMessage[]> {
  if (!client) return []

  const collected: TdMessage[] = []
  let cursor = fromMessageId

  for (let attempt = 0; attempt < HISTORY_MAX_FETCHES && collected.length < pageSize; attempt++) {
    const result = await client.invoke({
      _: 'getChatHistory',
      chat_id: chatId,
      from_message_id: cursor,
      offset: 0,
      limit: pageSize - collected.length,
      only_local: false,
    })
    const batch = result.messages.filter((m) => m !== null) as unknown as TdMessage[]
    if (batch.length === 0) break

    collected.push(...batch)
    cursor = batch[batch.length - 1]!.id
  }

  return collected
}

export async function getHistory(chatId: number): Promise<UiMessage[]> {
  if (!client || !allowedChatIdsCache.has(chatId)) return []

  const messages = await fetchHistoryPage(chatId, 0, HISTORY_PAGE_SIZE)
  for (const message of messages) enqueueMediaForMessage(message, true)

  return messages.map(mapMessage).reverse()
}

// Scroll infini : charge la page plus ancienne que beforeMessageId. Comme
// getHistory, ne dépend pas de syncChatHistory pour être réactif (qui peut
// être encore loin derrière sur un chat très actif) — TDLib sert depuis son
// cache local si déjà synced, sinon va chercher sur le serveur.
export async function getMoreHistory(chatId: number, beforeMessageId: number): Promise<UiMessage[]> {
  if (!client || !allowedChatIdsCache.has(chatId)) return []

  const messages = await fetchHistoryPage(chatId, beforeMessageId, HISTORY_PAGE_SIZE)
  for (const message of messages) enqueueMediaForMessage(message, true)

  return messages.map(mapMessage).reverse()
}

// Résout le chemin local d'un fichier déjà téléchargé (ou en cours), pour
// le protocole minigram-media://. Ne déclenche pas de téléchargement ici —
// c'est le rôle de processMediaQueue ; on se contente de lire l'état TDLib.
export async function resolveFilePath(fileId: number): Promise<string | null> {
  if (!client) return null
  try {
    const file = (await client.invoke({ _: 'getFile', file_id: fileId })) as unknown as {
      local?: { path?: string; is_downloading_completed?: boolean }
    }
    if (file.local?.is_downloading_completed && file.local.path) return file.local.path
    return null
  } catch {
    return null
  }
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

export async function addReaction(chatId: number, messageId: number, emoji: string): Promise<void> {
  if (!client) return
  await client.invoke({
    _: 'addMessageReaction',
    chat_id: chatId,
    message_id: messageId,
    reaction_type: { _: 'reactionTypeEmoji', emoji },
    is_big: false,
    update_recent_reactions: false,
  })
}

export async function removeReaction(chatId: number, messageId: number, emoji: string): Promise<void> {
  if (!client) return
  await client.invoke({
    _: 'removeMessageReaction',
    chat_id: chatId,
    message_id: messageId,
    reaction_type: { _: 'reactionTypeEmoji', emoji },
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

  if (kind === 'chat') void whitelistGroupMembers(id)
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

  if (kind === 'chat') void whitelistGroupMembers(id)
}

export interface SearchResult {
  kind: 'user' | 'chat'
  id: number
  name: string
}

export interface UiUserAvatar {
  userId: number
  photoFileId: number | null
  initials: string
  color: string
  name: string
}

export async function getUserAvatars(userIds: number[]): Promise<UiUserAvatar[]> {
  if (!client) return []
  return Promise.all(
    userIds.map(async (userId) => {
      try {
        const user = (await client!.invoke({ _: 'getUser', user_id: userId })) as unknown as TdUser
        const { initials, color, name } = mapUser(user)
        let photoFileId: number | null = null
        const smallId = user.profile_photo?.small?.id
        if (smallId) {
          try {
            await client!.invoke({ _: 'downloadFile', file_id: smallId, priority: 1, offset: 0, limit: 0, synchronous: true })
            photoFileId = smallId
          } catch {
            // photo indisponible, fallback sur les initiales
          }
        }
        return { userId, photoFileId, initials, color, name }
      } catch {
        return { userId, photoFileId: null, initials: '?', color: colorForId(userId), name: `Utilisateur ${userId}` }
      }
    }),
  )
}

export async function getGroupMembers(chatId: number): Promise<UiUserAvatar[]> {
  if (!client) return []
  try {
    const chat = (await client.invoke({ _: 'getChat', chat_id: chatId })) as unknown as TdChat
    const memberIds = await fetchGroupMemberIds(chat)
    return getUserAvatars(memberIds)
  } catch (err) {
    console.error('[telegram] getGroupMembers échoué pour', chatId, err)
    return []
  }
}

export async function openPrivateChat(userId: number): Promise<UiChat | null> {
  if (!client) return null
  try {
    const chat = (await client.invoke({ _: 'createPrivateChat', user_id: userId, force: false })) as unknown as TdChat
    return mapChat(chat)
  } catch (err) {
    console.error('[telegram] openPrivateChat échoué pour user', userId, err)
    return null
  }
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

export function getChatName(chatId: number): string {
  return chatNameCache.get(chatId) ?? ''
}

export async function openChat(chatId: number): Promise<void> {
  if (!client) return
  try {
    await client.invoke({ _: 'openChat', chat_id: chatId })
  } catch (err) {
    console.error('[telegram] openChat échoué pour', chatId, err)
  }
}

export async function closeChat(chatId: number): Promise<void> {
  if (!client) return
  try {
    await client.invoke({ _: 'closeChat', chat_id: chatId })
  } catch (err) {
    console.error('[telegram] closeChat échoué pour', chatId, err)
  }
}
