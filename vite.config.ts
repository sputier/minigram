import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // Pas de champ `entry` ici : vite-plugin-electron l'utilise pour
        // activer son mode "build.lib", qui impose `formats: ['es']` quand
        // package.json a "type": "module" et ignore notre `output.format`
        // ci-dessous. En passant l'entrée via `rollupOptions.input` à la
        // place, on reste sur un build Rollup classique qu'on contrôle
        // entièrement (comme pour preload, qui fonctionne déjà ainsi).
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              input: path.join(__dirname, 'electron/main.ts'),
              // tdl/prebuilt-tdlib chargent un addon natif via node-gyp-build,
              // qui résout les binaires prébuilds relativement au __dirname
              // du package tdl. Si Rollup les inline dans main.cjs, ce
              // __dirname devient celui du bundle (dist-electron) et la
              // résolution échoue ("No native build was found"). On les
              // garde donc external pour qu'ils restent de vrais `require()`
              // résolus depuis node_modules au runtime.
              external: ['tdl', 'prebuilt-tdlib'],
              output: {
                format: 'cjs',
                // .cjs (et non .js) car package.json a "type": "module" :
                // sans ça Node charge ce bundle CJS comme un module ES et
                // `__dirname`/`require`, utilisés par le chargeur d'addon
                // natif de tdl, n'existent plus.
                entryFileNames: 'main.cjs',
              },
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
              },
            },
          },
        },
      },
      renderer: {},
    }),
    renderer(),
  ],
})
