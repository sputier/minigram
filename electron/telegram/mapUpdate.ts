import { isChatAllowed, isUserAllowed, type Whitelist } from './whitelist'

export interface TdMessageContent {
  _: string
  text?: { _: string; text: string }
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
}

export interface TdChatType {
  _: string
  user_id?: number
}

export interface TdChat {
  _: 'chat'
  id: number
  type?: TdChatType
  title: string
  last_message?: TdMessage
  unread_count?: number
}

export type TdUpdate =
  | { _: 'updateNewMessage'; message: TdMessage }
  | { _: 'updateChatLastMessage'; chat_id: number; last_message?: TdMessage }
  | { _: 'updateUserStatus'; user_id: number; status?: { _: string } }
  | { _: 'updateConnectionState'; state?: { _: string } }
  | { _: 'updateMessageSendSucceeded'; message: TdMessage; old_message_id: number }
  | { _: string; [key: string]: unknown }

export interface UiMessage {
  id: number
  chatId: number
  text: string
  time: string
  outgoing: boolean
}

export interface UiChat {
  id: number
  name: string
  initials: string
  color: string
  lastMessage: string
  time: string
  unread?: number
}

export interface TdUser {
  _: 'user'
  id: number
  first_name: string
  last_name?: string
}

export interface UiSelf {
  id: number
  name: string
  initials: string
  color: string
}

export type MappedUpdate =
  | { kind: 'chat-last-message'; chatId: number; lastMessage: string; time: string }
  | { kind: 'new-message'; message: UiMessage }
  | { kind: 'connection-state'; state: string }
  | { kind: 'user-status'; userId: number; status: string }

export interface PendingCandidate {
  kind: 'user' | 'chat'
  id: number
  name: string
  preview: string
}

const AVATAR_COLORS = ['#e17076', '#7bc862', '#65aadd', '#a695e7', '#eea927', '#52c4eb', '#54cb68', '#ee7aae']

function extractText(content?: TdMessageContent): string {
  if (!content) return ''
  if (content._ === 'messageText' && content.text) return content.text.text
  return '[Média]'
}

function formatTime(unixSeconds?: number): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds) || unixSeconds <= 0) return ''
  return new Date(unixSeconds * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function colorForId(id: number): string {
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

export function mapMessage(message: TdMessage): UiMessage {
  return {
    id: message.id,
    chatId: message.chat_id,
    text: extractText(message.content),
    time: formatTime(message.date),
    outgoing: Boolean(message.is_outgoing),
  }
}

export function mapUser(user: TdUser): UiSelf {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  return {
    id: user.id,
    name: name || 'Compte connecté',
    initials: initialsForTitle(name),
    color: colorForId(user.id),
  }
}

export function mapChat(chat: TdChat): UiChat {
  return {
    id: chat.id,
    name: chat.title,
    initials: initialsForTitle(chat.title),
    color: colorForId(chat.id),
    lastMessage: chat.last_message ? extractText(chat.last_message.content) : '',
    time: chat.last_message ? formatTime(chat.last_message.date) : '',
    unread: chat.unread_count && chat.unread_count > 0 ? chat.unread_count : undefined,
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

  const preview = extractText(message.content)
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
      case 'updateNewMessage':
      case 'updateMessageSendSucceeded': {
        const message = (update as { message?: TdMessage }).message
        if (!message || typeof message.chat_id !== 'number') return null
        if (!isMessageAllowed(message, whitelist)) return null
        return { kind: 'new-message', message: mapMessage(message) }
      }
      case 'updateChatLastMessage': {
        const chatId = (update as { chat_id?: number }).chat_id
        if (typeof chatId !== 'number' || !isChatAllowed(whitelist, chatId)) return null
        const lastMessage = (update as { last_message?: TdMessage }).last_message
        return {
          kind: 'chat-last-message',
          chatId,
          lastMessage: lastMessage ? extractText(lastMessage.content) : '',
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
