import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Multi-page build: landing page plus the static legal pages.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        privacy: resolve(import.meta.dirname, 'privacy/index.html'),
        imprint: resolve(import.meta.dirname, 'imprint/index.html')
      }
    }
  }
});
