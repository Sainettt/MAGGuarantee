// UWAGI #17 (decision 2026-10-27) — tripwire: every page of the employee shell
// gates itself SERVER-side with `requirePermission`. The shell layout only
// admits the shell roles (`requireRoleAccess`) and the edge knows the role
// catalog only (docs/25 R3), so without a page gate a right revoked per user
// (docs/25 B6) — or a page whose edge rule was forgotten — renders the page
// chrome over a 403.
//
// For every `page.tsx` under `app/(employee)/employee/**` the gate must sit in
// the page itself or in a `layout.tsx` of the SAME directory (the pattern of
// the `(admin)` client pages: sso, teams, trailer-types), and whichever file
// carries it must not be a `'use client'` module — a client component cannot
// run the server check. Comments are stripped first, so a commented-out call
// does not count. A parent layout does not count either: `(admin)/layout.tsx`
// admits the whole segment, each page still checks its own permission.
//
// Exempt on purpose: the shell root `employee/page.tsx` (it only redirects to
// the first nav entry the user can see, via `requireRoleAccess`) and the
// «Brak dostępu» page `employee/forbidden/page.tsx` (the target of every
// denial — gating it would loop).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHELL_ROOT = join(WEB_ROOT, 'app', '(employee)', 'employee');

/** Relative to `SHELL_ROOT`, posix separators. */
const EXEMPT: readonly string[] = ['page.tsx', 'forbidden/page.tsx'];

const toPosix = (p: string): string => p.split(sep).join('/');

/**
 * Drops `//` and `/* *\/` comments while leaving string and template literals
 * intact (a `//` inside `'https://…'`, or a `/*` inside a line comment, must
 * not confuse it). Template-literal `${…}` nesting is not tracked — good
 * enough for page / layout modules, which is all this reads.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      out += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (c !== '`' && src[j] === '\n') break;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** A `requirePermission(` call survives comment stripping. */
function callsRequirePermission(src: string): boolean {
  return /\brequirePermission\s*\(/.test(stripComments(src));
}

/** The module opens with a `'use client'` directive. */
function isClientModule(src: string): boolean {
  return /^\s*(['"])use client\1/.test(stripComments(src));
}

function findPages(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findPages(full));
    else if (entry.isFile() && entry.name === 'page.tsx') found.push(full);
  }
  return found;
}

interface GateProblem {
  page: string;
  problem: string;
}

/** Why `page` (absolute path) is not gated, or null when it is. */
function gateProblem(page: string): GateProblem | null {
  const name = toPosix(relative(SHELL_ROOT, page));
  const layout = join(dirname(page), 'layout.tsx');
  const carriers = [page, ...(existsSync(layout) ? [layout] : [])].filter((file) =>
    callsRequirePermission(readFileSync(file, 'utf8')),
  );
  if (carriers.length === 0) {
    return {
      page: name,
      problem: 'no requirePermission( call in the page or in a layout.tsx of its directory',
    };
  }
  const client = carriers.filter((file) => isClientModule(readFileSync(file, 'utf8')));
  if (client.length > 0) {
    return {
      page: name,
      problem: `the gate sits in a 'use client' module: ${client
        .map((f) => toPosix(relative(SHELL_ROOT, f)))
        .join(', ')}`,
    };
  }
  return null;
}

describe('employee shell — every page gates itself server-side (UWAGI #17)', () => {
  const pages = findPages(SHELL_ROOT);
  const gated = pages.filter((p) => !EXEMPT.includes(toPosix(relative(SHELL_ROOT, p))));

  it('finds the pages (the walk is not empty)', () => {
    // 21 gated pages today; a lower bound only, so adding a page never breaks it.
    expect(gated.length).toBeGreaterThanOrEqual(21);
  });

  it('the exemption list matches reality (both exempt pages exist)', () => {
    for (const rel of EXEMPT) {
      expect(existsSync(join(SHELL_ROOT, rel)), rel).toBe(true);
    }
  });

  it.each(gated.map((p) => [toPosix(relative(SHELL_ROOT, p)), p] as const))(
    '%s',
    (_name, page) => {
      expect(gateProblem(page)).toBeNull();
    },
  );
});

describe('the gate detector itself', () => {
  it('a commented-out call does not count', () => {
    expect(callsRequirePermission(`// await requirePermission('x', o);`)).toBe(false);
    expect(callsRequirePermission(`/* await requirePermission('x', o); */`)).toBe(false);
    expect(
      callsRequirePermission(`/**\n * calls requirePermission('x', o)\n */\nexport {};`),
    ).toBe(false);
  });

  it('a real call counts — also after a line comment holding `/*`', () => {
    expect(
      callsRequirePermission(`await requirePermission('x', { onDenied: 'forbidden' });`),
    ).toBe(true);
    expect(
      callsRequirePermission(
        `// pages live under /employee/(admin)/* here\nawait requirePermission('x', o);\n/** doc */`,
      ),
    ).toBe(true);
  });

  it("tells a 'use client' module apart", () => {
    expect(isClientModule(`'use client';\n\nexport default function V() {}`)).toBe(true);
    expect(isClientModule(`"use client";`)).toBe(true);
    expect(isClientModule(`// header\n'use client';\n`)).toBe(true);
    expect(isClientModule(`import x from 'y';\n// 'use client'`)).toBe(false);
    expect(isClientModule(`// 'use client' would break the gate\nexport {};`)).toBe(false);
  });
});
