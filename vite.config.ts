import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: '/app/',
  publicDir: false,
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/storage': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'public/app',
    emptyOutDir: true,
    // Keep hashed production assets cacheable between releases. Vite already
    // minifies with esbuild; these settings make the split predictable so a
    // change to one feature does not invalidate unrelated vendor code.
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return undefined
          if (id.includes('/pdfjs-dist/')) return 'pdf-viewer-vendor'
          if (id.includes('/xlsx/')) return 'spreadsheet-vendor'
          if (id.includes('/recharts/')) return 'charts-vendor'
          if (id.includes('/jspdf/')) return 'pdf-generation-vendor'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router')) return 'react-vendor'
          return undefined
        },
      },
    },
  },
})
