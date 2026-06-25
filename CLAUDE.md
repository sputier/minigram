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

\- Fichier de config `whitelist.json` (dans `userData`), schéma inchangé :

&#x20; ```json

&#x20; {

&#x20;   "allowed\_user\_ids": \[123456789, 987654321],

&#x20;   "allowed\_chat\_ids": \[-1001234567890]

&#x20; }

&#x20; ```

\- L'UI \*\*n'affiche que\*\* les chats dont l'`id` est dans la whitelist

\- Le fichier peut être édité à la main par le parent (hors de l'app), \*\*et/ou\*\* rempli automatiquement par l'app elle-même :

&#x20; - \*\*Seed initial\*\* : à la toute première connexion réussie, si `whitelist.json` est encore vide, toutes les discussions déjà existantes sur le compte sont considérées comme des contacts légitimes déjà ajoutés par le parent, et auto-whitelistées (`seedWhitelistIfEmpty` dans `electron/telegram/client.ts`). Ne se déclenche qu'une fois (tant que le fichier reste non vide).

&#x20; - \*\*Actions admin\*\* : approuver une demande en attente, ou ajouter un résultat de recherche, écrit aussi dans ce fichier (voir sections ci-dessous).

\- Les messages entrants d'un chat/contact ni whitelisté ni en attente sont ignorés silencieusement (pas de notification, pas d'affichage)



\### Demandes en attente (`pending-chats.json`)

\- Fichier dans `userData`, géré uniquement par l'app (jamais édité à la main en usage normal) :

&#x20; ```json

&#x20; {

&#x20;   "pending": \[{ "kind": "user", "id": 123, "name": "...", "preview": "...", "firstSeen": 1700000000 }],

&#x20;   "blocked": \[{ "kind": "user", "id": 456 }]

&#x20; }

&#x20; ```

\- Le premier message d'un chat/contact ni whitelisté ni bloqué crée une entrée `pending` (dédupliquée par id) — l'enfant ne voit jamais ces discussions ni ces messages.

\- Le parent valide (`Approuver` → ajout à `whitelist.json`) ou rejette (`Rejeter` → ajout à `blocked`, \*\*blocage permanent\*\* : ce contact ne redéclenchera plus jamais de demande) exclusivement depuis le gate admin caché.



\### Fonctionnalités désactivées dans l'UI (enfant)

\- Recherche globale Telegram (`searchPublicChats`, `searchContacts`) — \*\*sauf\*\* dans le gate admin (voir ci-dessous), réservée au parent

\- Découverte de contacts, suggestions — même nuance : interdit pour l'enfant, disponible pour le parent via le gate admin pour gérer la whitelist

\- Accès aux chaînes/groupes publics

\- Modification du profil

\- Paramètres du compte Telegram

\- DevTools Electron (`webContents.openDevTools()` désactivé en prod)



\### Archivage complet de l'historique (texte + médias)

\- Objectif : récupérer l'historique \*\*complet\*\* (sans limite de profondeur) de chaque discussion whitelistée, médias compris (photos, vidéos, audio, documents, stickers, animations), de façon résiliente à une fermeture de l'app en cours de route.

\- \*\*`history-sync.json`\*\* (dans `userData`) : progression par chat — `{ chats: [{ chatId, oldestMessageId, complete }] }`. Une file de fond (`enqueueHistorySync`/`processHistorySyncQueue`/`syncChatHistory` dans `electron/telegram/client.ts`) pagine vers le passé via `getChatHistory`, persiste `oldestMessageId` après \*\*chaque\*\* batch (pas seulement à la fin), et reprend exactement là où elle s'était arrêtée au redémarrage suivant.

\- \*\*`media-sync.json`\*\* (dans `userData`) : file des fichiers à télécharger — `{ entries: [{ fileId, chatId, messageId, status: "pending"|"done" }] }`, dédupliquée par `fileId`. Découverte à chaque message traité (affichage, scroll, sync de fond, live).

\- \*\*Point d'attention TDLib important\*\* : un `file_id` n'est valide que pour la durée de vie du process TDLib qui l'a émis — le persister puis le réutiliser après un redémarrage de l'app échoue avec \*\*"File not found"\*\*, même si le fichier existe côté serveur. `media-sync.json` ne sert donc qu'à dédupliquer/lister ce qui reste à faire ; avant chaque téléchargement, le code rafraîchit le message d'origine (`getMessage(chatId, messageId)`) pour obtenir l'identifiant de fichier valide dans la session en cours, puis appelle `downloadFile`.

\- \*\*Affichage\*\* : scroll infini vers le haut dans `ChatView` (`getMoreHistory(chatId, beforeMessageId)`), avec préservation de la position de scroll lors du chargement de messages plus anciens (pas de saut visuel). Les médias téléchargés sont servis au renderer via le protocole custom `minigram-media://<fileId>` (enregistré dans `main.ts`), qui résout l'id en chemin local exclusivement via TDLib (`getFile`) — jamais d'accès direct au système de fichiers depuis le renderer, avec vérification que le chemin résolu reste dans `td_files`.



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



Canaux additionnels (gate admin, protégés par mot de passe + raccourci caché `Ctrl+Alt+Shift+P`) :

\- `admin:get-pending` / `admin:approve-pending` / `admin:reject-pending` — gestion des demandes en attente

\- `admin:search-contacts` / `admin:add-to-whitelist` — recherche et ajout proactif réservés au parent

\- `tg:chats-changed` — rediffusion de la liste de chats vers le renderer après une action admin (approbation/ajout), pour que l'UI enfant se mette à jour sans redémarrage

\- `tg:get-more-history` — pagination vers le passé pour le scroll infini (`getMoreHistory`)

\- `tg:media-ready` — notifie le renderer qu'un fichier média vient de finir de se télécharger (déclenche un nouvel essai d'affichage)



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

\- Tout accès à des chats hors whitelist

