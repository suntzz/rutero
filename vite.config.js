import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Dos páginas: el formulario de campo (/) y la descarga interna (/interno/).
// Con VITE_DEMO=1 (GitHub Pages) se arma la demo: un servidor de mentiras en el navegador responde
// /api con datos inventados. VITE_BASE es la carpeta donde se publica (p. ej. /rutero/).
const demo = process.env.VITE_DEMO === '1';

export default defineConfig({
  root: 'web',
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  resolve: {
    alias: { 'rutero-modo': resolve(__dirname, demo ? 'web/src/demo/index.js' : 'web/src/demo/nada.js') },
  },
  build: {
    outDir: demo ? '../dist-demo' : '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        campo: resolve(__dirname, 'web/index.html'),
        interno: resolve(__dirname, 'web/interno/index.html'),
      },
    },
  },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
