import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: ['index.html', '404.html'],
    },
  },
  server: {
    open: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
