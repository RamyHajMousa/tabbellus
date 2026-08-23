import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
    cors: {
      origin: true, // Allow any origin
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization", "x-requested-with", "Accept", "Origin", "Cache-Control", "upgrade-insecure-requests"],
      credentials: true,
    },
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/dexie/')) {
            return 'vendor-dexie';
          }
          if (id.includes('node_modules/@radix-ui/') || id.includes('node_modules/cmdk/')) {
            return 'vendor-ui';
          }
          if (id.includes('node_modules/@atlaskit/')) {
            return 'vendor-dnd';
          }
          if (id.includes('node_modules/react-virtuoso/')) {
            return 'vendor-virtuoso';
          }
        },
      },
    },
  },
});
