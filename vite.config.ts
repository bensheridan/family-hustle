import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Stamped into the bundle and written alongside it, so a running copy can
// tell whether the server has moved on without it. See src/lib/version.ts.
const BUILD_ID = new Date().toISOString()

export default defineConfig(({ command }) => ({
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
    __BASE_URL__: JSON.stringify(command === 'build' ? '/family-hustle/' : '/'),
  },
  // The demo is served from a project page at /family-hustle/, but dev stays
  // at the root so localhost URLs are not a special case.
  base: command === 'build' ? '/family-hustle/' : '/',
  server: { port: 5173 },
}))
