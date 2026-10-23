// docs/28 §9.2 #18 + docs/25 §3 B4 — the edge middleware must not pull the
// shared barrel. `@magguarantee/shared` resolves to the package's index, which
// re-exports every zod schema; one value import from it anywhere in the
// middleware's import graph drags zod into the edge bundle. The catalog is
// reachable ONLY through the dependency-free `@magguarantee/shared/permissions`
// subpath (behind `lib/auth/permissions.ts`).
//
// This test walks the VALUE-import graph from `middleware.ts` (relative and
// `@/` specifiers, plus that one allowed subpath) and fails on:
//   * a value import / re-export from bare `@magguarantee/shared`;
//   * a value import from any other `@magguarantee/shared/<sub>` path.
// Type-only imports (`import type …`, `import { type A, type B } …`) are
// erased at compile time and are not followed.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHARED_SRC = resolve(WEB_ROOT, '../../packages/shared/src');
const SHARED = '@magguarantee/shared';
const ALLOWED_SHARED_SUBPATH = `${SHARED}/permissions`;

interface ImportStmt {
  specifier: string;
  typeOnly: boolean;
  text: string;
}

/** Strips comments so commented-out imports don't count. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Every static `import … from`, side-effect `import '…'`, `export … from`, `import('…')`. */
function parseImports(src: string): ImportStmt[] {
  const code = stripComments(src);
  const out: ImportStmt[] = [];
  const fromRe = /\b(import|export)\s+(type\s+)?([^;'"`]*?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(fromRe)) {
    const [text, , typeKw, clause = '', specifier = ''] = m;
    out.push({ specifier, typeOnly: Boolean(typeKw) || isAllTypeClause(clause), text });
  }
  for (const m of code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) {
    out.push({ specifier: m[1] ?? '', typeOnly: false, text: m[0] });
  }
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push({ specifier: m[1] ?? '', typeOnly: false, text: m[0] });
  }
  return out;
}

/** `{ type A, type B }` (every named specifier type-only, no default/namespace). */
function isAllTypeClause(clause: string): boolean {
  const c = clause.trim();
  const braces = /^\{([\s\S]*)\}$/.exec(c);
  if (!braces) return false;
  const names = (braces[1] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return names.length > 0 && names.every((n) => n.startsWith('type '));
}

function resolveFile(base: string): string | null {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return resolveFile(resolve(dirname(fromFile), specifier));
  }
  if (specifier.startsWith('@/')) return resolveFile(resolve(WEB_ROOT, specifier.slice(2)));
  if (specifier === ALLOWED_SHARED_SUBPATH) return resolveFile(join(SHARED_SRC, 'permissions'));
  // A relative import inside packages/shared/src stays relative (handled above).
  return null; // bare package (next/server, …) — not ours
}

const toPosix = (p: string): string => p.split(sep).join('/');

interface Violation {
  file: string;
  text: string;
}

function walk(entry: string): { visited: string[]; violations: Violation[] } {
  const seen = new Set<string>();
  const violations: Violation[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const stmt of parseImports(readFileSync(file, 'utf8'))) {
      if (stmt.typeOnly) continue;
      const isShared = stmt.specifier === SHARED || stmt.specifier.startsWith(`${SHARED}/`);
      if (isShared && stmt.specifier !== ALLOWED_SHARED_SUBPATH) {
        violations.push({ file: toPosix(relative(WEB_ROOT, file)), text: stmt.text });
        continue;
      }
      const next = resolveSpecifier(file, stmt.specifier);
      if (next) queue.push(next);
    }
  }
  return { visited: [...seen].map((f) => toPosix(relative(WEB_ROOT, f))), violations };
}

describe('edge bundle: no value import from the shared barrel', () => {
  const result = walk(resolve(WEB_ROOT, 'middleware.ts'));

  it('walks the real graph (middleware → roles → auth/permissions → shared catalog)', () => {
    expect(result.visited).toEqual(
      expect.arrayContaining([
        'middleware.ts',
        'lib/roles.ts',
        'lib/auth/constants.ts',
        'lib/auth/permissions.ts',
        '../../packages/shared/src/permissions.ts',
      ]),
    );
  });

  it('has no value import from `@magguarantee/shared` (or another subpath)', () => {
    expect(result.violations).toEqual([]);
  });
});

describe('the import parser itself', () => {
  const kinds = (src: string) =>
    parseImports(src).map((s) => [s.specifier, s.typeOnly] as const);

  it('tells type-only from value imports', () => {
    expect(kinds(`import type { Role } from '@magguarantee/shared';`)).toEqual([
      [SHARED, true],
    ]);
    expect(kinds(`import { type A, type B } from '@magguarantee/shared';`)).toEqual([
      [SHARED, true],
    ]);
    expect(kinds(`import { type A, RoleSchema } from '@magguarantee/shared';`)).toEqual([
      [SHARED, false],
    ]);
    expect(
      kinds(`import {\n  LIDER_ROLES,\n  type Role,\n} from '@magguarantee/shared';`),
    ).toEqual([[SHARED, false]]);
    expect(kinds(`export * from '@magguarantee/shared';`)).toEqual([[SHARED, false]]);
    expect(kinds(`export { RoleSchema } from '@magguarantee/shared';`)).toEqual([
      [SHARED, false],
    ]);
    expect(kinds(`import '@magguarantee/shared';`)).toEqual([[SHARED, false]]);
  });

  it('ignores commented-out imports', () => {
    expect(kinds(`// import { RoleSchema } from '@magguarantee/shared';`)).toEqual([]);
    expect(kinds(`/* import { RoleSchema } from '@magguarantee/shared'; */`)).toEqual([]);
  });

  it('would flag a barrel value import in an edge file', () => {
    const violating = parseImports(`import { RoleSchema } from '@magguarantee/shared';`);
    expect(violating.some((s) => !s.typeOnly && s.specifier === SHARED)).toBe(true);
  });
});
