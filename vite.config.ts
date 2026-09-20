import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // The demo is served from a project page at /family-hustle/, but dev stays
  // at the root so localhost URLs are not a special case.
  base: command === 'build' ? '/family-hustle/' : '/',
  server: { port: 5173 },
}))
