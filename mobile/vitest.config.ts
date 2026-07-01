import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// Vitest is the fast, no-network tier (L1 pure logic + L2 SessionManager scenarios + L3 RTL
// components). It runs in jsdom, mocks the transport/persistence at the module boundary, and never
// touches Supabase/WebCrypto. Playwright (tests/*.spec.ts) stays the real-browser e2e layer.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: '@', replacement: path.resolve(dir, './src') }],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    css: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Reset spy state between tests so globally-installed mocks (notifications, capacitor) don't bleed.
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Report-only (per plan): print/emit coverage but never fail the build on a threshold.
      include: ['src/lib/**', 'src/components/**'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts'],
    },
  },
});
