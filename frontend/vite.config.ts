import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const backendTarget = 'http://127.0.0.1:8080';

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/ws-endpoint': {
        target: backendTarget,
        changeOrigin: true,
        ws: true,
        rewrite: (path) => '/api' + path,
      },
      '/v1': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
});

