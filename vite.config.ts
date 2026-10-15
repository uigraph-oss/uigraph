import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('./viewer', import.meta.url)),
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    outDir: fileURLToPath(new URL('./dist/viewer', import.meta.url)),
    emptyOutDir: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': fileURLToPath(new URL('./viewer/src', import.meta.url)),
    },
  },
})
