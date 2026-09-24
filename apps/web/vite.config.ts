import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Use the shared package straight from source so types + runtime stay in sync.
      '@sell/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward API + photo requests to the Fastify server in dev.
      '/api': 'http://localhost:8123',
    },
  },
});
