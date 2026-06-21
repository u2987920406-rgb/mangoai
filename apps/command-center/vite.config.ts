import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Mango Command Center — outil perso de Raf, port dedie 5180 (ne touche pas 3000/5173/5174).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
  },
})
