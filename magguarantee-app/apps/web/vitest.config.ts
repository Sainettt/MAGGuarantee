import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Minimal node-environment config for the web app's PURE helper tests
// (lib/format/**, lib/limits/**, lib/claims/**) plus the framework-free
// modules that live next to their component (`components/**/*.test.ts` — the
// permission derivation). `.tsx` is deliberately NOT matched: there is no
// jsdom and no React plugin here, so anything that renders must first be
// extracted into a pure module. Aliases mirror tsconfig.json so `@/…` and
// `@magguarantee/shared` resolve in tests exactly as they do in the app.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'lib/**/*.{test,spec}.ts',
      'components/**/*.{test,spec}.ts',
    ],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      '@magguarantee/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
});
