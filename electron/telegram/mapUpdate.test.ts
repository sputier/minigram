import { describe, expect, it } from 'vitest'
import {
  extractMedia,
  extractPendingCandidate,
  isChatObjectAllowed,
  isMessageAllowed,
  mapChat,
  mapMessage,
  mapUpdate,
  mapUser,
  type TdChat,
  type TdFile,
  type TdMessage,
  type TdMessageContent,
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

const photoMessage: TdMessage = {
  ...allowedGroupMessage,
  id: 3,
  content: {
    _: 'messagePhoto',
    photo: { _: 'photo', sizes: [{ _: 'photoSize', photo: { _: 'file', id: 555 }, width: 1280, height: 1280 }] },
  },
}

describe('mapMessage', () => {
  it('mappe un message texte', () => {
    const result = mapMessage(allowedGroupMessage)
    expect(result.text).toBe('Salut')
    expect(result.chatId).toBe(-1001)
    expect(result.outgoing).toBe(false)
  })

  it('texte vide pour un média sans légende (le média est rendu inline, pas de doublon textuel)', () => {
    const result = mapMessage(photoMessage)
    expect(result.text).toBe('')
    expect(result.media).toEqual({ fileId: 555, kind: 'photo' })
  })

  it('utilise la légende comme texte si présente', () => {
    const captioned: TdMessage = {
      ...photoMessage,
      content: { ...photoMessage.content!, caption: { _: 'formattedText', text: 'Regarde ça' } },
    }
    expect(mapMessage(captioned).text).toBe('Regarde ça')
  })

  it("n'ajoute pas de champ media pour un message texte", () => {
    expect(mapMessage(allowedGroupMessage).media).toBeUndefined()
  })
})

describe('extractMedia', () => {
  const file: TdFile = { _: 'file', id: 555 }

  it('retourne null sans contenu', () => {
    expect(extractMedia(undefined)).toBeNull()
  })

  it('retourne null pour un message texte', () => {
    expect(extractMedia(allowedGroupMessage.content)).toBeNull()
  })

  it('extrait la plus grande taille de photo', () => {
    const content: TdMessageContent = {
      _: 'messagePhoto',
      photo: {
        _: 'photo',
        sizes: [
          { _: 'photoSize', photo: { _: 'file', id: 1 }, width: 90, height: 90 },
          { _: 'photoSize', photo: file, width: 1280, height: 1280 },
        ],
      },
    }
    expect(extractMedia(content)).toEqual({ fileId: 555, kind: 'photo' })
  })

  it('extrait une vidéo avec mime/nom de fichier', () => {
    const content: TdMessageContent = {
      _: 'messageVideo',
      video: { _: 'video', video: file, mime_type: 'video/mp4', file_name: 'clip.mp4' },
    }
    expect(extractMedia(content)).toEqual({ fileId: 555, kind: 'video', mimeType: 'video/mp4', fileName: 'clip.mp4' })
  })

  it('extrait un message vocal', () => {
    const content: TdMessageContent = {
      _: 'messageVoiceNote',
      voice_note: { _: 'voiceNote', voice: file, mime_type: 'audio/ogg' },
    }
    expect(extractMedia(content)).toEqual({ fileId: 555, kind: 'voice', mimeType: 'audio/ogg' })
  })

  it('extrait un document', () => {
    const content: TdMessageContent = {
      _: 'messageDocument',
      document: { _: 'document', document: file, mime_type: 'application/pdf', file_name: 'rapport.pdf' },
    }
    expect(extractMedia(content)).toEqual({
      fileId: 555,
      kind: 'document',
      mimeType: 'application/pdf',
      fileName: 'rapport.pdf',
    })
  })

  it('extrait un sticker', () => {
    const content: TdMessageContent = { _: 'messageSticker', sticker: { _: 'sticker', sticker: file } }
    expect(extractMedia(content)).toEqual({ fileId: 555, kind: 'sticker' })
  })

  it('extrait une animation (GIF)', () => {
    const content: TdMessageContent = { _: 'messageAnimation', animation: { _: 'animation', animation: file } }
    expect(extractMedia(content)).toEqual({ fileId: 555, kind: 'animation', mimeType: undefined, fileName: undefined })
  })

  it('retourne null si le contenu déclaré ne porte pas le fichier attendu', () => {
    expect(extractMedia({ _: 'messagePhoto' })).toBeNull()
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

describe('extractPendingCandidate', () => {
  it('retourne null si le chat est déjà autorisé par chat_id', () => {
    expect(extractPendingCandidate({ _: 'updateNewMessage', message: allowedGroupMessage }, whitelist)).toBeNull()
  })

  it("retourne null si l'expéditeur est déjà autorisé par user_id (chat privé)", () => {
    const privateMessage: TdMessage = {
      ...strangerMessage,
      chat_id: -3003,
      sender_id: { _: 'messageSenderUser', user_id: 111 },
    }
    expect(extractPendingCandidate({ _: 'updateNewMessage', message: privateMessage }, whitelist)).toBeNull()
  })

  it('retourne un candidat "user" pour un inconnu (messageSenderUser)', () => {
    const result = extractPendingCandidate({ _: 'updateNewMessage', message: strangerMessage }, whitelist)
    expect(result).toEqual({ kind: 'user', id: 999, name: 'Utilisateur 999', preview: 'Bonjour inconnu' })
  })

  it('retourne un candidat "chat" pour un envoi anonyme (messageSenderChat)', () => {
    const anonymousMessage: TdMessage = {
      ...strangerMessage,
      sender_id: { _: 'messageSenderChat', chat_id: -2002 },
    }
    const result = extractPendingCandidate({ _: 'updateNewMessage', message: anonymousMessage }, whitelist)
    expect(result).toEqual({ kind: 'chat', id: -2002, name: 'Discussion -2002', preview: 'Bonjour inconnu' })
  })

  it("retourne null pour tout type d'update autre que updateNewMessage", () => {
    expect(extractPendingCandidate({ _: 'updateChatLastMessage', chat_id: -2002 }, whitelist)).toBeNull()
    expect(extractPendingCandidate({ _: 'updateUserStatus', user_id: 999 }, whitelist)).toBeNull()
    expect(extractPendingCandidate({ _: 'updateConnectionState' }, whitelist)).toBeNull()
  })

  it('ne throw jamais sur un update malformé', () => {
    expect(() => extractPendingCandidate({ _: 'updateNewMessage' } as never, whitelist)).not.toThrow()
    expect(extractPendingCandidate({ _: 'updateNewMessage' } as never, whitelist)).toBeNull()
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

  it('utilise un label descriptif pour un dernier message média sans légende', () => {
    const chatWithPhoto: TdChat = { ...groupChat, last_message: photoMessage }
    expect(mapChat(chatWithPhoto).lastMessage).toBe('📷 Photo')
  })
})
