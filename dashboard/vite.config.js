import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the embedded admin dashboard into dashboard/dist, which the Express
// server serves. Assets are emitted under /assets so the server can long-cache
// them while always serving a fresh index.html.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
