import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Minimal node-environment config for the web app's PURE helper tests
// (lib/format/**). Component/RHF/Next code is NOT under test here; only
// framework-free logic, so no jsdom or React plugin is needed. Aliases mirror
// tsconfig.json so `@/…` and `@magguarantee/shared` resolve in tests exactly
// as they do in the app.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.{test,spec}.ts'],
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
