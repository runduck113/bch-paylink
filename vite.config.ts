/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths: the build works from any static host path (Cloudflare Pages, GitHub Pages, a subfolder).
  base: './',
  plugins: [react()],
  build: {
    // The wallet chunk (libauth + Electrum + WizardConnect) is large but only loaded on the pay and receipt pages.
    chunkSizeWarningLimit: 1300,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
