import { defineConfig } from 'vite';

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: false,
    headers: crossOriginIsolationHeaders,

    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    headers: crossOriginIsolationHeaders,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 35000,
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/core', '@ffmpeg/core-mt', '@ffmpeg/ffmpeg'],
  },
});
