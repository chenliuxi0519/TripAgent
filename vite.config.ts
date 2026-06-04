import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Dev proxy: forward the frontend's /api calls to the FastAPI backend so the
  // browser talks to a single origin (no CORS hassle in dev). Override the
  // backend address with BACKEND_URL if it isn't on localhost:8000.
  server: {
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react'
            }
            if (id.includes('framer-motion') || id.includes('sonner') || id.includes('react-markdown')) {
              return 'vendor-ui'
            }
            if (id.includes('leaflet')) {
              return 'vendor-map'
            }
            if (id.includes('html2canvas') || id.includes('jspdf') || id.includes('dompurify') || id.includes('canvg')) {
              return 'vendor-export'
            }
            if (id.includes('zustand')) {
              return 'vendor-zustand'
            }
          }
        },
      },
    },
  },
})
