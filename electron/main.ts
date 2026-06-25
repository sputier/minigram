import 'dotenv/config'
import { app, BrowserWindow, globalShortcut, ipcMain, net, protocol } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { checkAdminPassword } from './admin/authGate'
import {
  addToWhitelist,
  approvePending,
  getChats,
  getHistory,
  getMe,
  getMoreHistory,
  getPendingRequests,
  rejectPending,
  resolveFilePath,
  searchContacts,
  sendMessage,
  startClient,
  startLogin,
  submitAuthCode,
  submitAuthPassword,
  submitPhoneNumber,
  type AuthState,
} from './telegram/client'
import type { MappedUpdate, UiChat } from './telegram/mapUpdate'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const ADMIN_GATE_SHORTCUT = 'Control+Alt+Shift+P'
const MEDIA_PROTOCOL = 'minigram-media'

// Doit être enregistré avant app.whenReady().
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_PROTOCOL, privileges: { secure: true, supportFetchAPI: true, stream: true, standard: true } },
])

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#17212b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function broadcastAuthState(state: AuthState) {
  win?.webContents.send('tg:auth-state', state)
}

function broadcastUpdate(update: MappedUpdate) {
  win?.webContents.send('tg:update', update)
}

function broadcastChats(chats: UiChat[]) {
  win?.webContents.send('tg:chats-changed', chats)
}

function broadcastMediaReady(fileId: number) {
  win?.webContents.send('tg:media-ready', fileId)
}

app.whenReady().then(() => {
  createWindow()

  globalShortcut.register(ADMIN_GATE_SHORTCUT, () => {
    win?.webContents.send('admin:toggle-gate')
  })

  // Sert au renderer les fichiers déjà téléchargés par TDLib (photos,
  // vidéos, audio, documents...) sans jamais lui donner d'accès direct au
  // système de fichiers. fileId est résolu en chemin local exclusivement
  // via resolveFilePath (qui interroge TDLib lui-même, getFile) — le
  // renderer ne peut donc jamais demander un chemin arbitraire. Vérification
  // supplémentaire en profondeur : le chemin résolu doit rester dans
  // td_files, au cas où TDLib renverrait un jour autre chose.
  const filesDirectory = path.resolve(path.join(app.getPath('userData'), 'td_files'))

  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    const fileId = Number(new URL(request.url).hostname)
    if (!Number.isInteger(fileId) || fileId <= 0) {
      return new Response('Identifiant de fichier invalide', { status: 400 })
    }

    const localPath = await resolveFilePath(fileId)
    if (!localPath) {
      return new Response('Fichier non disponible', { status: 404 })
    }

    const resolved = path.resolve(localPath)
    if (resolved !== filesDirectory && !resolved.startsWith(filesDirectory + path.sep)) {
      return new Response('Accès refusé', { status: 403 })
    }

    return net.fetch(pathToFileURL(resolved).toString())
  })

  startClient({
    apiId: Number(process.env.TELEGRAM_API_ID),
    apiHash: process.env.TELEGRAM_API_HASH ?? '',
    databaseEncryptionKey: process.env.TDLIB_ENCRYPTION_KEY ?? '',
    onAuthState: broadcastAuthState,
    onUpdate: broadcastUpdate,
    onMediaReady: broadcastMediaReady,
  })
})

ipcMain.handle('admin:submit-password', (_event, password: string) => {
  const expected = process.env.ADMIN_PASSWORD ?? ''
  const ok = checkAdminPassword(password, expected)
  if (ok) startLogin()
  return { ok }
})

ipcMain.handle('admin:submit-phone', (_event, phone: string) => {
  submitPhoneNumber(phone)
})

ipcMain.handle('admin:submit-code', (_event, code: string) => {
  submitAuthCode(code)
})

ipcMain.handle('admin:submit-auth-password', (_event, password: string) => {
  submitAuthPassword(password)
})

ipcMain.handle('tg:get-me', () => getMe())

ipcMain.handle('tg:get-chats', () => getChats())

ipcMain.handle('tg:get-history', (_event, chatId: number) => getHistory(chatId))

ipcMain.handle('tg:get-more-history', (_event, chatId: number, beforeMessageId: number) =>
  getMoreHistory(chatId, beforeMessageId),
)

ipcMain.handle('tg:send-message', (_event, chatId: number, text: string) => sendMessage(chatId, text))

ipcMain.handle('admin:get-pending', () => getPendingRequests())

ipcMain.handle('admin:approve-pending', async (_event, kind: 'user' | 'chat', id: number) => {
  approvePending(kind, id)
  broadcastChats(await getChats())
  return getPendingRequests()
})

ipcMain.handle('admin:reject-pending', (_event, kind: 'user' | 'chat', id: number) => {
  rejectPending(kind, id)
  return getPendingRequests()
})

ipcMain.handle('admin:search-contacts', (_event, query: string) => searchContacts(query))

ipcMain.handle('admin:add-to-whitelist', async (_event, kind: 'user' | 'chat', id: number) => {
  addToWhitelist(kind, id)
  broadcastChats(await getChats())
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
