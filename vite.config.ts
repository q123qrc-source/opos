import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The renderer is loaded from file:// in production, so assets must be relative.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
