export interface MockMessage {
  id: number
  text: string
  time: string
  outgoing: boolean
}

export interface MockChat {
  id: number
  name: string
  initials: string
  color: string
  lastMessage: string
  time: string
  unread?: number
  messages: MockMessage[]
}

export const mockChats: MockChat[] = [
  {
    id: 1,
    name: 'Maman',
    initials: 'M',
    color: '#e17076',
    lastMessage: 'Tu rentres à quelle heure ?',
    time: '14:32',
    unread: 2,
    messages: [
      { id: 1, text: 'Coucou ! Bien arrivé à l\'école ?', time: '08:15', outgoing: false },
      { id: 2, text: 'Oui maman, tout va bien !', time: '08:16', outgoing: true },
      { id: 3, text: 'Super, bonne journée 🙂', time: '08:16', outgoing: false },
      { id: 4, text: 'Tu rentres à quelle heure ?', time: '14:32', outgoing: false },
    ],
  },
  {
    id: 2,
    name: 'Papa',
    initials: 'P',
    color: '#7bc862',
    lastMessage: "N'oublie pas ton sac de sport",
    time: '12:05',
    messages: [
      { id: 1, text: "N'oublie pas ton sac de sport", time: '12:05', outgoing: false },
      { id: 2, text: "C'est noté !", time: '12:10', outgoing: true },
    ],
  },
  {
    id: 3,
    name: 'Mamie',
    initials: 'M',
    color: '#65aadd',
    lastMessage: 'Gros bisous',
    time: 'Hier',
    messages: [
      { id: 1, text: 'On se voit dimanche ?', time: 'Hier 18:02', outgoing: false },
      { id: 2, text: 'Oui mamie, avec plaisir !', time: 'Hier 18:05', outgoing: true },
      { id: 3, text: 'Gros bisous', time: 'Hier 18:06', outgoing: false },
    ],
  },
  {
    id: 4,
    name: 'Famille 👨‍👩‍👧',
    initials: 'F',
    color: '#a695e7',
    lastMessage: 'Papa: On part à 10h samedi',
    time: 'Lundi',
    messages: [
      { id: 1, text: 'On part à 10h samedi', time: 'Lundi 09:00', outgoing: false },
      { id: 2, text: "D'accord !", time: 'Lundi 09:12', outgoing: true },
    ],
  },
]
