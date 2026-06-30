import { defineConfig } from 'vite';

// COOP/COEP headers required for multi-threaded ffmpeg.wasm
// (enables SharedArrayBuffer, which the MT core needs for pthreads)
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
