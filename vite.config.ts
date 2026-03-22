import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },

  build: {
    target: 'es2018',
    sourcemap: true,
    rollupOptions: {
      input: {
        main:  path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin.html'),
      },
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/leaflet')) return 'leaflet'
          if (id.includes('node_modules/react') || id.includes('node_modules/zustand')) return 'vendor'
        },
      },
    },
  },

  server: { port: 5173, host: true },
})
