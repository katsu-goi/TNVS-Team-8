import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    clearMocks: true,
  },
  define: {
    global: 'window',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The downloaded hourglass uses shapes only. The light player avoids the
      // expression evaluator that production CSP intentionally blocks.
      'lottie-web': path.resolve(__dirname, './node_modules/lottie-web/build/player/lottie_light.js'),
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
          'ui-vendor': ['lucide-react'],
          'lottie-vendor': ['lottie-react'],
        },
      },
    },
  },
});
