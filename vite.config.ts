import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: './',
  clearScreen: false,
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: mode === 'desktop' ? 'dist-desktop' : 'dist', assetsDir: 'build', chunkSizeWarningLimit: 700 },
}));
