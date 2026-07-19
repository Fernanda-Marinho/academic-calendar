import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy /api requests to the Express server during development
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3004',
      '/auth': 'http://localhost:3004'
    }
  }
})
