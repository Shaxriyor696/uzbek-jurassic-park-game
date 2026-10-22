import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE — ichki manzil (GitHub Pages: /<repository-nomi>/); lokal — «/»
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1200 },
});
