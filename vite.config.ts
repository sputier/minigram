import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  // Charge le .env (sans restriction de préfixe) pour le build du main process.
  // En développement : process.env est alimenté par dotenv/config au runtime.
  // En production (app packagée) : .env n'existe pas sur le PC de l'utilisateur
  // final — les valeurs sont injectées ici comme des littéraux dans main.cjs.
  const env = loadEnv(mode, process.cwd(), '')

  const mainEnvDefine: Record<string, string> = {
    'process.env.TELEGRAM_API_ID': JSON.stringify(env.TELEGRAM_API_ID ?? ''),
    'process.env.TELEGRAM_API_HASH': JSON.stringify(env.TELEGRAM_API_HASH ?? ''),
    'process.env.TDLIB_ENCRYPTION_KEY': JSON.stringify(env.TDLIB_ENCRYPTION_KEY ?? ''),
    'process.env.ADMIN_PASSWORD': JSON.stringify(env.ADMIN_PASSWORD ?? ''),
  }

  return {
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
            define: mainEnvDefine,
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
                // electron-updater : external car il dépend de modules propres
                // à electron-builder (builder-util-runtime, etc.) et ne doit
                // pas être bundlé.
                external: ['tdl', 'prebuilt-tdlib', 'electron-updater'],
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
  }
})
