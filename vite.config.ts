import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Stamped into the bundle and written alongside it, so a running copy can
// tell whether the server has moved on without it. See src/lib/version.ts.
const BUILD_ID = new Date().toISOString()

// tsc checks this file without Node's types, and only env is needed
declare const process: { env: Record<string, string | undefined> }

// Two builds of the same app (docs/sync-boxes.md):
//   pages — the demo on GitHub Pages at /family-hustle/; a Pi is reached
//           over https by address
//   hub   — served by the family's box itself at /, with the sync API on the
//           same origin (npm run build:hub)
const HUB = process.env.FH_TARGET === 'hub'

// In development, `FH_SYNC_PROXY=http://127.0.0.1:8787 npm run dev` forwards
// /api to a sync server, so the box needs no CORS for localhost.
const SYNC_PROXY = process.env.FH_SYNC_PROXY

export default defineConfig(({ command }) => {
  const base = command === 'build' && !HUB ? '/family-hustle/' : '/'
  return {
    plugins: [
      react(),
      {
        name: 'family-hustle-version',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ build: BUILD_ID }),
          })
        },
      },
    ],
    define: {
      __BUILD_ID__: JSON.stringify(command === 'build' ? BUILD_ID : 'dev'),
      __BASE_URL__: JSON.stringify(base),
      __HUB__: JSON.stringify(HUB),
    },
    // The demo is served from a project page at /family-hustle/, but dev and
    // the hub stay at the root so their URLs are not a special case.
    base,
    build: { outDir: HUB ? 'dist-hub' : 'dist' },
    server: {
      port: 5173,
      proxy: SYNC_PROXY ? { '/api': SYNC_PROXY } : undefined,
    },
  }
})
