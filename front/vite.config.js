import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 6677,
    // The front calls relative /api URLs: in dev they are forwarded to the back (HTTP and WebSocket)
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:6678',
        ws: true,
      },
    },
  },
})
