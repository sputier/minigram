\# MiniGram — Client Telegram parental pour enfant



\## Objectif



Application de messagerie bureau Windows pour un enfant (pas de smartphone).

Basée sur TDLib (la lib officielle Telegram), interface similaire à Telegram Desktop/Web.

\*\*Verrouillée côté UI\*\* : l'enfant ne peut communiquer qu'avec une liste blanche de contacts/groupes définie par le parent.



\---



\## Stack technique



\- \*\*Electron\*\* (main process + preload)

\- \*\*React + Vite\*\* (renderer)

\- \*\*Tailwind CSS\*\* (style, dark theme proche Telegram)

\- \*\*tdl\*\* (npm) — binding Node.js pour TDLib

\- \*\*prebuilt-tdlib\*\* — fournit les binaires TDLib pré-compilés (évite de compiler TDLib en C++ ; remplace l'ancien `tdl-install-binaries`, retiré de npm)

\- \*\*TypeScript\*\* partout



\---



\## Architecture



```

main.js (Electron main)

&#x20; └── TDLib via tdl

&#x20;       └── events push (updateNewMessage, updateChatLastMessage, etc.)

&#x20;       └── IPC → renderer via contextBridge



preload.ts

&#x20; └── expose API sécurisée au renderer (contextBridge)



renderer/ (React)

&#x20; └── Sidebar (liste des chats autorisés)

&#x20; └── ChatView (bulles de messages, input)

&#x20; └── ContactList (whitelist uniquement)

```



\---



\## Contraintes de sécurité parentale (NON NÉGOCIABLES)



\### Whitelist contacts/groupes

\- Fichier de config `whitelist.json` éditable uniquement par le parent (hors de l'app) :

&#x20; ```json

&#x20; {

&#x20;   "allowed\_user\_ids": \[123456789, 987654321],

&#x20;   "allowed\_chat\_ids": \[-1001234567890]

&#x20; }

&#x20; ```

\- L'UI \*\*n'affiche que\*\* les chats dont l'`id` est dans la whitelist

\- Les messages entrants d'inconnus sont ignorés silencieusement (pas de notification, pas d'affichage)



\### Fonctionnalités désactivées dans l'UI

\- Recherche globale Telegram (pas de `searchPublicChats`)

\- Découverte de contacts, suggestions

\- Accès aux chaînes/groupes publics

\- Modification du profil

\- Paramètres du compte Telegram

\- DevTools Electron (`webContents.openDevTools()` désactivé en prod)



\### Session pré-authentifiée

\- Le parent crée le compte Telegram de l'enfant (numéro virtuel possible)

\- La session TDLib est initialisée une fois par le parent, puis le fichier de session chiffré est copié

\- L'enfant ne voit pas le flow d'authentification (SMS/code)

\- Clé de chiffrement du storage TDLib stockée dans un fichier config parent



\---



\## TDLib / tdl — points clés



```bash

npm install tdl prebuilt-tdlib

\# les binaires natifs sont téléchargés automatiquement à l'install, rien à lancer en plus

```



\### Pattern de base tdl

```typescript

import \* as tdl from 'tdl'

import { getTdjson } from 'prebuilt-tdlib'



tdl.configure({ tdjson: getTdjson() })



const client = tdl.createClient({

&#x20; apiId: TELEGRAM\_API\_ID,       // à créer sur https://my.telegram.org, fourni via .env

&#x20; apiHash: TELEGRAM\_API\_HASH,

&#x20; databaseDirectory: path.join(app.getPath('userData'), 'td\_db'),

&#x20; filesDirectory: path.join(app.getPath('userData'), 'td\_files'),

&#x20; databaseEncryptionKey: TDLIB\_ENCRYPTION\_KEY,  // requis, fourni via .env (NON NÉGOCIABLE)

})



// Les updates arrivent en PUSH (pas de polling)

client.on('update', (update) => {

&#x20; if (update.\_ === 'updateNewMessage') {

&#x20;   // filtrer par whitelist avant d'envoyer au renderer via IPC

&#x20; }

})



// Envoyer une requête

await client.invoke({ \_: 'getMe' })

await client.invoke({ \_: 'sendMessage', chat\_id: 123, ... })

```



\### Updates importants à gérer

\- `updateNewMessage` — nouveau message reçu

\- `updateMessageSendSucceeded` — message envoyé confirmé

\- `updateChatLastMessage` — mise à jour sidebar

\- `updateUserStatus` — statut en ligne (optionnel)

\- `updateConnectionState` — état de la connexion réseau



\---



\## IPC Electron (main ↔ renderer)



```typescript

// preload.ts — API exposée au renderer

contextBridge.exposeInMainWorld('telegram', {

&#x20; sendMessage: (chatId: number, text: string) => ipcRenderer.invoke('send-message', chatId, text),

&#x20; getHistory: (chatId: number) => ipcRenderer.invoke('get-history', chatId),

&#x20; onUpdate: (cb: (update: any) => void) => ipcRenderer.on('tg-update', (\_, u) => cb(u)),

})

```



Le main process filtre \*\*toujours\*\* par whitelist avant de transmettre un update au renderer.



\---



\## UI — style Telegram



\- Dark theme : background `#17212b`, sidebar `#0e1621`, bulles sortantes `#2b5278`, entrantes `#182533`

\- Police : system-ui ou Inter

\- Layout : sidebar fixe 320px gauche, chat area flex-1 droite

\- Bulles arrondies avec timestamp en bas à droite

\- Scroll inversé (messages récents en bas), virtualisé si besoin (`react-window`)



\---



\## Packaging



```bash

npm run build          # Vite build du renderer

electron-builder       # génère un .exe installable Windows

```



Config `electron-builder.json` : target NSIS (installeur Windows), icône custom.



\---



\## Prérequis avant de commencer



1\. Créer une app Telegram sur https://my.telegram.org → obtenir `api id` et `api\_hash`

2\. Prévoir un numéro de téléphone pour le compte de l'enfant

3\. Node.js 18+ installé



\---



\## Ce qu'il NE faut PAS implémenter



\- Appels audio/vidéo

\- Stories

\- Bots

\- Paiements

\- Jeux Telegram

\- Téléchargement auto de médias (laisser manuel)

\- Tout accès à des chats hors whitelist

