import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Minimal node-environment config for the web app's PURE helper tests
// (lib/format/**, lib/limits/**, lib/claims/**) plus the framework-free
// modules that live next to their component (`components/**/*.test.ts` — the
// permission derivation). `.tsx` is deliberately NOT matched: there is no
// jsdom and no React plugin here, so anything that renders must first be
// extracted into a pure module. Aliases mirror tsconfig.json so `@/…`,
// `@magguarantee/shared` and its `/permissions` subpath resolve in tests
// exactly as they do in the app.
//
// The shared aliases are ANCHORED regexes: a plain string alias also matches
// `@magguarantee/shared/<sub>` and would rewrite the subpath to
// `…/src/index.ts/<sub>`. The subpath is the edge-safe entry point of the
// permissions catalog (docs/25 §3 B4, `lib/auth/permissions.ts`).
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'lib/**/*.{test,spec}.ts',
      'components/**/*.{test,spec}.ts',
    ],
  },
  resolve: {
    alias: [
      {
        find: /^@magguarantee\/shared\/permissions$/,
        replacement: fileURLToPath(
          new URL('../../packages/shared/src/permissions.ts', import.meta.url),
        ),
      },
      {
        find: /^@magguarantee\/shared$/,
        replacement: fileURLToPath(
          new URL('../../packages/shared/src/index.ts', import.meta.url),
        ),
      },
      { find: '@', replacement: fileURLToPath(new URL('./', import.meta.url)) },
    ],
  },
});
