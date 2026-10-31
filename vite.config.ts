/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // Production build is served from GitHub Pages at https://runduck113.github.io/bch-paylink/.
  // Dev server stays at the root. Routing is hash-based, so no 404.html fallback is needed.
  base: command === 'build' ? '/bch-paylink/' : '/',
  plugins: [react()],
  build: {
    // The wallet chunk (libauth + Electrum + WizardConnect) is large but only loaded on the pay and receipt pages.
    chunkSizeWarningLimit: 1300,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
