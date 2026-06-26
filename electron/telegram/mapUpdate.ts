import { isChatAllowed, isUserAllowed, type Whitelist } from './whitelist'

export interface TdFile {
  _: 'file'
  id: number
  local?: { path?: string; is_downloading_completed?: boolean }
}

export interface TdMessageContent {
  _: string
  text?: { _: string; text: string }
  caption?: { _: string; text: string }
  emoji?: string
  photo?: { _: 'photo'; sizes: Array<{ _: 'photoSize'; photo: TdFile; width: number; height: number }> }
  video?: { _: 'video'; video: TdFile; mime_type?: string; file_name?: string }
  voice_note?: { _: 'voiceNote'; voice: TdFile; mime_type?: string }
  document?: { _: 'document'; document: TdFile; mime_type?: string; file_name?: string }
  sticker?: { _: 'sticker'; sticker: TdFile }
  animation?: { _: 'animation'; animation: TdFile; mime_type?: string; file_name?: string }
}

interface TdReactionTypeEmoji {
  _: 'reactionTypeEmoji'
  emoji: string
}

interface TdMessageReaction {
  type: TdReactionTypeEmoji | { _: string }
  total_count: number
  is_chosen?: boolean
  recent_sender_ids?: Array<{ _: string; user_id?: number }>
}

interface TdMessageInteractionInfo {
  reactions?: { reactions: TdMessageReaction[] }
}

export interface TdMessageSender {
  _: 'messageSenderUser' | 'messageSenderChat'
  user_id?: number
  chat_id?: number
}

export interface TdMessage {
  _: 'message'
  id: number
  chat_id: number
  sender_id?: TdMessageSender
  is_outgoing?: boolean
  date?: number
  content?: TdMessageContent
  interaction_info?: TdMessageInteractionInfo
  reply_to?: { _: string; message_id?: number; chat_id?: number }
}

export interface TdChatType {
  _: string
  user_id?: number
  basic_group_id?: number
  supergroup_id?: number
}

export interface TdChat {
  _: 'chat'
  id: number
  type?: TdChatType
  title: string
  last_message?: TdMessage
  unread_count?: number
  last_read_inbox_message_id?: number
  photo?: { small?: { id: number } }
}

export type TdUpdate =
  | { _: 'updateNewMessage'; message: TdMessage }
  | { _: 'updateChatLastMessage'; chat_id: number; last_message?: TdMessage }
  | { _: 'updateUserStatus'; user_id: number; status?: { _: string } }
  | { _: 'updateConnectionState'; state?: { _: string } }
  | { _: 'updateMessageSendSucceeded'; message: TdMessage; old_message_id: number }
  | { _: string; [key: string]: unknown }

export type UiMediaKind = 'photo' | 'video' | 'voice' | 'document' | 'sticker' | 'animation'

export interface UiMediaRef {
  fileId: number
  kind: UiMediaKind
  mimeType?: string
  fileName?: string
}

export interface UiReaction {
  emoji: string
  count: number
  chosen: boolean
  recentSenderIds: number[]
}

export interface UiMessage {
  id: number
  chatId: number
  text: string
  time: string
  outgoing: boolean
  senderId?: number
  media?: UiMediaRef
  reactions?: UiReaction[]
  replyToMessageId?: number
}

export interface UiChat {
  id: number
  name: string
  initials: string
  color: string
  photoFileId: number | null
  isGroup: boolean
  lastMessage: string
  time: string
  unread?: number
  lastReadInboxMessageId?: number
}

export interface TdUser {
  _: 'user'
  id: number
  first_name: string
  last_name?: string
  profile_photo?: { small?: { id: number } }
}

export interface UiSelf {
  id: number
  name: string
  initials: string
  color: string
  photoFileId: number | null
}

export type MappedUpdate =
  | { kind: 'chat-last-message'; chatId: number; lastMessage: string; time: string }
  | { kind: 'new-message'; message: UiMessage }
  | { kind: 'message-reactions'; chatId: number; messageId: number; reactions: UiReaction[] }
  | { kind: 'chat-read-inbox'; chatId: number; lastReadInboxMessageId: number; unreadCount: number }
  | { kind: 'connection-state'; state: string }
  | { kind: 'user-status'; userId: number; status: string }

export interface PendingCandidate {
  kind: 'user' | 'chat'
  id: number
  name: string
  preview: string
}

const AVATAR_COLORS = ['#e17076', '#7bc862', '#65aadd', '#a695e7', '#eea927', '#52c4eb', '#54cb68', '#ee7aae']

const MEDIA_LABELS: Record<string, string> = {
  messagePhoto: '📷 Photo',
  messageVideo: '🎥 Vidéo',
  messageVoiceNote: '🎤 Message vocal',
  messageDocument: '📄 Document',
  messageSticker: 'Sticker',
  messageAnimation: 'GIF',
}

// Texte affiché dans la bulle de la conversation : le texte brut pour un
// message texte, la légende pour un média qui en a une, sinon vide (le
// média lui-même est rendu inline par l'UI, pas la peine de dupliquer un
// label générique en dessous).
function extractText(content?: TdMessageContent): string {
  if (!content) return ''
  if (content._ === 'messageText' && content.text) return content.text.text
  if (content._ === 'messageAnimatedEmoji' && content.emoji) return content.emoji
  if (content.caption?.text) return content.caption.text
  return ''
}

// Texte affiché dans les aperçus (sidebar, demandes en attente) : pas de
// rendu média possible dans ces contextes, donc on retombe sur un label
// descriptif plutôt qu'une chaîne vide.
function extractPreviewText(content?: TdMessageContent): string {
  const text = extractText(content)
  if (text) return text
  if (!content) return ''
  return MEDIA_LABELS[content._] ?? '[Média]'
}

function largestPhotoFile(photo: NonNullable<TdMessageContent['photo']>): TdFile | undefined {
  return photo.sizes.at(-1)?.photo
}

// Pure, sans I/O : identifie le fichier à télécharger pour un message média,
// si applicable. Le téléchargement effectif est géré côté glue (client.ts).
export function extractMedia(content?: TdMessageContent): UiMediaRef | null {
  if (!content) return null
  switch (content._) {
    case 'messagePhoto': {
      const file = content.photo && largestPhotoFile(content.photo)
      return file ? { fileId: file.id, kind: 'photo' } : null
    }
    case 'messageVideo': {
      const file = content.video?.video
      return file
        ? { fileId: file.id, kind: 'video', mimeType: content.video?.mime_type, fileName: content.video?.file_name }
        : null
    }
    case 'messageVoiceNote': {
      const file = content.voice_note?.voice
      return file ? { fileId: file.id, kind: 'voice', mimeType: content.voice_note?.mime_type } : null
    }
    case 'messageDocument': {
      const file = content.document?.document
      return file
        ? {
            fileId: file.id,
            kind: 'document',
            mimeType: content.document?.mime_type,
            fileName: content.document?.file_name,
          }
        : null
    }
    case 'messageSticker': {
      const file = content.sticker?.sticker
      return file ? { fileId: file.id, kind: 'sticker' } : null
    }
    case 'messageAnimation': {
      const file = content.animation?.animation
      return file
        ? {
            fileId: file.id,
            kind: 'animation',
            mimeType: content.animation?.mime_type,
            fileName: content.animation?.file_name,
          }
        : null
    }
    default:
      return null
  }
}

function formatTime(unixSeconds?: number): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds) || unixSeconds <= 0) return ''
  return new Date(unixSeconds * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function colorForId(id: number): string {
  const index = Math.abs(id) % AVATAR_COLORS.length
  return AVATAR_COLORS[index]
}

function initialsForTitle(title: string): string {
  const trimmed = title.trim()
  return trimmed ? trimmed[0]!.toUpperCase() : '?'
}

function senderUserId(message: TdMessage): number | undefined {
  return message.sender_id?._ === 'messageSenderUser' ? message.sender_id.user_id : undefined
}

function extractReactions(info?: TdMessageInteractionInfo): UiReaction[] | undefined {
  const raw = info?.reactions?.reactions
  if (!raw?.length) return undefined
  const result = raw
    .filter((r): r is TdMessageReaction & { type: TdReactionTypeEmoji } => r.type._ === 'reactionTypeEmoji' && r.total_count > 0)
    .map((r) => ({
      emoji: r.type.emoji,
      count: r.total_count,
      chosen: Boolean(r.is_chosen),
      recentSenderIds: (r.recent_sender_ids ?? [])
        .filter((s) => s._ === 'messageSenderUser' && typeof s.user_id === 'number')
        .map((s) => s.user_id as number)
        .slice(0, 3),
    }))
  return result.length > 0 ? result : undefined
}

export function mapMessage(message: TdMessage): UiMessage {
  const media = extractMedia(message.content)
  const reactions = extractReactions(message.interaction_info)
  const senderId =
    message.sender_id?._ === 'messageSenderUser' && !message.is_outgoing
      ? message.sender_id.user_id
      : undefined
  const replyToMessageId =
    message.reply_to?._ === 'messageReplyToMessage' && typeof message.reply_to.message_id === 'number'
      ? message.reply_to.message_id
      : undefined
  return {
    id: message.id,
    chatId: message.chat_id,
    text: extractText(message.content),
    time: formatTime(message.date),
    outgoing: Boolean(message.is_outgoing),
    ...(senderId ? { senderId } : {}),
    ...(media ? { media } : {}),
    ...(reactions ? { reactions } : {}),
    ...(replyToMessageId ? { replyToMessageId } : {}),
  }
}

export function mapUser(user: TdUser): UiSelf {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  return {
    id: user.id,
    name: name || 'Compte connecté',
    initials: initialsForTitle(name),
    color: colorForId(user.id),
    photoFileId: user.profile_photo?.small?.id ?? null,
  }
}

export function mapChat(chat: TdChat): UiChat {
  const t = chat.type?._
  return {
    id: chat.id,
    name: chat.title,
    initials: initialsForTitle(chat.title),
    color: colorForId(chat.id),
    photoFileId: chat.photo?.small?.id ?? null,
    isGroup: t === 'chatTypeBasicGroup' || t === 'chatTypeSupergroup',
    lastMessage: chat.last_message ? extractPreviewText(chat.last_message.content) : '',
    time: chat.last_message ? formatTime(chat.last_message.date) : '',
    unread: chat.unread_count && chat.unread_count > 0 ? chat.unread_count : undefined,
    lastReadInboxMessageId: chat.last_read_inbox_message_id,
  }
}

// Un chat est autorisé soit directement par son chat_id (groupes/canaux),
// soit, pour une conversation privée, via l'user_id du correspondant —
// les deux listes de whitelist.json couvrent des cas différents.
export function isChatObjectAllowed(chat: TdChat, whitelist: Whitelist): boolean {
  if (isChatAllowed(whitelist, chat.id)) return true
  if (chat.type?._ === 'chatTypePrivate' && typeof chat.type.user_id === 'number') {
    return isUserAllowed(whitelist, chat.type.user_id)
  }
  return false
}

export function isMessageAllowed(message: TdMessage, whitelist: Whitelist): boolean {
  if (isChatAllowed(whitelist, message.chat_id)) return true
  const userId = senderUserId(message)
  return userId !== undefined && isUserAllowed(whitelist, userId)
}

// Détecte qu'updateNewMessage vient d'un chat/expéditeur hors whitelist, pour
// le faire remonter en "demande en attente" côté client.ts au lieu de
// disparaître silencieusement (cas déjà couvert par mapUpdate). Pure, sans
// I/O — le nom n'est qu'un placeholder, enrichi via getUser/getChat côté
// glue. Volontairement limité à updateNewMessage : updateMessageSendSucceeded
// est l'écho des messages sortants de l'enfant (déjà gatés par sendMessage),
// et updateChatLastMessage est un doublon du même événement.
export function extractPendingCandidate(update: TdUpdate, whitelist: Whitelist): PendingCandidate | null {
  if (update._ !== 'updateNewMessage') return null
  const message = (update as { message?: TdMessage }).message
  if (!message || typeof message.chat_id !== 'number') return null
  if (isMessageAllowed(message, whitelist)) return null

  const preview = extractPreviewText(message.content)
  const userId = senderUserId(message)

  if (userId !== undefined) {
    return { kind: 'user', id: userId, name: `Utilisateur ${userId}`, preview }
  }
  return { kind: 'chat', id: message.chat_id, name: `Discussion ${message.chat_id}`, preview }
}

// Point de filtrage central : retourne null pour tout ce qui ne doit jamais
// atteindre le renderer (chat/expéditeur hors whitelist, update malformé).
export function mapUpdate(update: TdUpdate, whitelist: Whitelist): MappedUpdate | null {
  try {
    switch (update._) {
      case 'updateNewMessage': {
        const message = (update as { message?: TdMessage }).message
        if (!message || typeof message.chat_id !== 'number') return null
        if (!isMessageAllowed(message, whitelist)) return null
        // updateMessageSendSucceeded arrive ensuite avec l'ID définitif pour
        // les messages sortants — ignorer updateNewMessage outgoing pour éviter
        // le doublon (ID temporaire puis ID serveur).
        if (message.is_outgoing) return null
        return { kind: 'new-message', message: mapMessage(message) }
      }
      case 'updateMessageSendSucceeded': {
        const message = (update as { message?: TdMessage }).message
        if (!message || typeof message.chat_id !== 'number') return null
        if (!isMessageAllowed(message, whitelist)) return null
        return { kind: 'new-message', message: mapMessage(message) }
      }
      case 'updateMessageInteractionInfo': {
        const chatId = (update as { chat_id?: number }).chat_id
        if (typeof chatId !== 'number') return null
        // isChatAllowed couvre les groupes/canaux ; les chats privés (chatId > 0 = userId) passent via isUserAllowed
        if (!isChatAllowed(whitelist, chatId) && !(chatId > 0 && isUserAllowed(whitelist, chatId))) return null
        const messageId = (update as { message_id?: number }).message_id
        if (typeof messageId !== 'number') return null
        const info = (update as { interaction_info?: TdMessageInteractionInfo }).interaction_info
        const reactions = extractReactions(info) ?? []
        return { kind: 'message-reactions', chatId, messageId, reactions }
      }
      case 'updateChatLastMessage': {
        const chatId = (update as { chat_id?: number }).chat_id
        if (typeof chatId !== 'number' || !isChatAllowed(whitelist, chatId)) return null
        const lastMessage = (update as { last_message?: TdMessage }).last_message
        return {
          kind: 'chat-last-message',
          chatId,
          lastMessage: lastMessage ? extractPreviewText(lastMessage.content) : '',
          time: lastMessage ? formatTime(lastMessage.date) : '',
        }
      }
      case 'updateUserStatus': {
        const userId = (update as { user_id?: number }).user_id
        if (typeof userId !== 'number' || !isUserAllowed(whitelist, userId)) return null
        const status = (update as { status?: { _: string } }).status?._
        return { kind: 'user-status', userId, status: status ?? 'unknown' }
      }
      case 'updateConnectionState': {
        const state = (update as { state?: { _: string } }).state?._
        return { kind: 'connection-state', state: state ?? 'unknown' }
      }
      default:
        return null
    }
  } catch {
    return null
  }
}
