import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
  },
  server: {
    proxy: {
      '/api/vetscribe': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true
      },
      '/api/v1/vetscribe': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/ws-chat': {
        target: 'http://localhost:8080',
        ws: true
      }
    }
  },
  build: {
    target: 'es2020',
    sourcemap: false, // Prevent source code exposure in production builds
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            return 'vendor';
          }
        }
      }
    }
  }
})
