import { contextBridge } from 'electron'

// API exposée au renderer. Vide pour l'instant : l'intégration tdl
// viendra dans une étape ultérieure et ajoutera ici sendMessage,
// getHistory, onUpdate, etc.
contextBridge.exposeInMainWorld('minigram', {
  version: process.versions.electron,
})
