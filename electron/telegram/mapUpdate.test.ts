import { describe, expect, it } from 'vitest'
import {
  isChatObjectAllowed,
  isMessageAllowed,
  mapChat,
  mapMessage,
  mapUpdate,
  mapUser,
  type TdChat,
  type TdMessage,
  type TdUser,
} from './mapUpdate'
import type { Whitelist } from './whitelist'

const whitelist: Whitelist = { allowed_user_ids: [111], allowed_chat_ids: [-1001] }

const allowedGroupMessage: TdMessage = {
  _: 'message',
  id: 1,
  chat_id: -1001,
  sender_id: { _: 'messageSenderUser', user_id: 111 },
  is_outgoing: false,
  date: 1_700_000_000,
  content: { _: 'messageText', text: { _: 'formattedText', text: 'Salut' } },
}

const strangerMessage: TdMessage = {
  _: 'message',
  id: 2,
  chat_id: -2002,
  sender_id: { _: 'messageSenderUser', user_id: 999 },
  is_outgoing: false,
  date: 1_700_000_000,
  content: { _: 'messageText', text: { _: 'formattedText', text: 'Bonjour inconnu' } },
}

describe('mapMessage', () => {
  it('mappe un message texte', () => {
    const result = mapMessage(allowedGroupMessage)
    expect(result.text).toBe('Salut')
    expect(result.chatId).toBe(-1001)
    expect(result.outgoing).toBe(false)
  })

  it('retombe sur un placeholder pour un contenu non textuel', () => {
    const photoMessage: TdMessage = { ...allowedGroupMessage, content: { _: 'messagePhoto' } }
    expect(mapMessage(photoMessage).text).toBe('[Média]')
  })
})

describe('isMessageAllowed', () => {
  it('autorise un message dans un chat whitelisté', () => {
    expect(isMessageAllowed(allowedGroupMessage, whitelist)).toBe(true)
  })

  it("refuse un message d'un inconnu dans un chat non whitelisté", () => {
    expect(isMessageAllowed(strangerMessage, whitelist)).toBe(false)
  })

  it("autorise via l'user_id même si le chat_id n'est pas dans la liste", () => {
    const privateMessage: TdMessage = { ...strangerMessage, chat_id: -3003, sender_id: { _: 'messageSenderUser', user_id: 111 } }
    expect(isMessageAllowed(privateMessage, whitelist)).toBe(true)
  })
})

describe('mapUpdate', () => {
  it('mappe updateNewMessage pour un chat whitelisté', () => {
    const result = mapUpdate({ _: 'updateNewMessage', message: allowedGroupMessage }, whitelist)
    expect(result).toEqual({
      kind: 'new-message',
      message: {
        id: 1,
        chatId: -1001,
        text: 'Salut',
        time: expect.any(String),
        outgoing: false,
      },
    })
  })

  it("retourne null pour updateNewMessage d'un chat non whitelisté", () => {
    const result = mapUpdate({ _: 'updateNewMessage', message: strangerMessage }, whitelist)
    expect(result).toBeNull()
  })

  it('mappe updateChatLastMessage pour un chat whitelisté', () => {
    const result = mapUpdate(
      { _: 'updateChatLastMessage', chat_id: -1001, last_message: allowedGroupMessage },
      whitelist,
    )
    expect(result).toEqual({
      kind: 'chat-last-message',
      chatId: -1001,
      lastMessage: 'Salut',
      time: expect.any(String),
    })
  })

  it('retourne null pour updateChatLastMessage hors whitelist', () => {
    const result = mapUpdate({ _: 'updateChatLastMessage', chat_id: -9999 }, whitelist)
    expect(result).toBeNull()
  })

  it('retourne null pour updateUserStatus hors whitelist', () => {
    const result = mapUpdate({ _: 'updateUserStatus', user_id: 999 }, whitelist)
    expect(result).toBeNull()
  })

  it('mappe updateUserStatus pour un user whitelisté', () => {
    const result = mapUpdate(
      { _: 'updateUserStatus', user_id: 111, status: { _: 'userStatusOnline' } },
      whitelist,
    )
    expect(result).toEqual({ kind: 'user-status', userId: 111, status: 'userStatusOnline' })
  })

  it('laisse toujours passer updateConnectionState (info globale, non liée à un chat)', () => {
    const result = mapUpdate({ _: 'updateConnectionState', state: { _: 'connectionStateReady' } }, whitelist)
    expect(result).toEqual({ kind: 'connection-state', state: 'connectionStateReady' })
  })

  it('ignore les types d\'update non gérés', () => {
    expect(mapUpdate({ _: 'updateSomethingElse' }, whitelist)).toBeNull()
  })

  it('ne throw jamais sur un update malformé', () => {
    expect(() => mapUpdate({ _: 'updateNewMessage' } as never, whitelist)).not.toThrow()
    expect(mapUpdate({ _: 'updateNewMessage' } as never, whitelist)).toBeNull()
  })
})

describe('mapUser', () => {
  it("mappe l'utilisateur connecté avec prénom et nom", () => {
    const user: TdUser = { _: 'user', id: 42, first_name: 'Ada', last_name: 'Lovelace' }
    expect(mapUser(user)).toMatchObject({ id: 42, name: 'Ada Lovelace', initials: 'A' })
  })

  it('retombe sur un nom par défaut sans prénom', () => {
    const user: TdUser = { _: 'user', id: 7, first_name: '' }
    expect(mapUser(user).name).toBe('Compte connecté')
  })
})

describe('chat-level filtering', () => {
  const groupChat: TdChat = { _: 'chat', id: -1001, title: 'Famille', type: { _: 'chatTypeSupergroup' } }
  const privateChatAllowedByUser: TdChat = {
    _: 'chat',
    id: -5005,
    title: 'Maman',
    type: { _: 'chatTypePrivate', user_id: 111 },
  }
  const privateChatStranger: TdChat = {
    _: 'chat',
    id: -6006,
    title: 'Inconnu',
    type: { _: 'chatTypePrivate', user_id: 999 },
  }

  it('autorise un groupe whitelisté par chat_id', () => {
    expect(isChatObjectAllowed(groupChat, whitelist)).toBe(true)
  })

  it("autorise un chat privé whitelisté par l'user_id du correspondant", () => {
    expect(isChatObjectAllowed(privateChatAllowedByUser, whitelist)).toBe(true)
  })

  it('refuse un chat privé avec un correspondant inconnu', () => {
    expect(isChatObjectAllowed(privateChatStranger, whitelist)).toBe(false)
  })

  it('mappe un chat vers le modèle UI', () => {
    const chatWithMessage: TdChat = { ...groupChat, last_message: allowedGroupMessage }
    const result = mapChat(chatWithMessage)
    expect(result).toMatchObject({ id: -1001, name: 'Famille', lastMessage: 'Salut' })
    expect(result.initials).toBe('F')
  })
})
