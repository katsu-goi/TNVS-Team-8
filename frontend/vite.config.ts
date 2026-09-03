import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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
    hmr: false,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws-endpoint': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => '/api' + path,
      },
      '/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'data-vendor': ['axios', 'zustand', '@supabase/supabase-js'],
          'charts-vendor': ['recharts'],
          'maps-vendor': ['leaflet', 'leaflet.markercluster', 'react-leaflet'],
          'realtime-vendor': ['@stomp/stompjs', 'sockjs-client'],
          'ui-vendor': ['lucide-react'],
        },
      },
    },
  },
});

