import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// While developing, the browser talks to Vite (port 5173) and Vite forwards /api to the server.
// The server only accepts requests from its own address (APP_ORIGIN), so the forwarded
// requests are labelled with that address. This is for development only.
const API_TARGET = process.env.API_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('origin', API_TARGET);
          });
        },
      },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
