import { defineConfig } from 'vitest/config'

// Config dédiée (et non vite.config.ts) pour que Vitest ne charge pas
// vite-plugin-electron, qui tenterait de builder/lancer Electron pendant les tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.ts'],
  },
})
