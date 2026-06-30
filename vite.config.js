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
  },
  preview: {
    port: 4173,
    headers: crossOriginIsolationHeaders,
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
