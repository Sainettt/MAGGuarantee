#!/usr/bin/env node
/**
 * Post-build copy of the Prisma-generated client into dist/.
 *
 * The hand-written entry (src/index.ts) is compiled by tsc, which emits
 * `require("./generated")` at dist/index.js. For that require to resolve at
 * runtime we need the generated client (and its native engine binaries)
 * sitting next to it under dist/generated/.
 *
 * Cross-platform on purpose — Windows users in the team can run the same
 * script that CI runs on Linux without `cp -R` or `xcopy` divergence.
 *
 * On Windows, the Prisma native engine (query_engine-windows.dll.node) can
 * end up read-only or briefly locked after a previous `prisma generate`.
 * We work around that with a chmod-then-unlink retry on EPERM.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src', 'generated');
const dest = path.join(root, 'dist', 'generated');

function rmrf(target) {
  if (!fs.existsSync(target)) return;
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    return;
  } catch (err) {
    if (err && err.code !== 'EPERM' && err.code !== 'EBUSY') throw err;
  }
  // Fallback: walk + chmod 0o666 + unlink. Handles Windows read-only flag
  // on Prisma's native engine .dll.node files.
  const walk = (p) => {
    const stat = fs.lstatSync(p);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(p)) walk(path.join(p, entry));
      try { fs.rmdirSync(p); } catch (e) { /* swallow */ }
    } else {
      try { fs.chmodSync(p, 0o666); } catch (e) { /* not always possible */ }
      try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
    }
  };
  walk(target);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const fromPath = path.join(from, entry.name);
    const toPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(fromPath, toPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

if (!fs.existsSync(src)) {
  console.error(
    `[copy-generated] ${src} does not exist. Run \`npm run generate\` first.`,
  );
  process.exit(1);
}

rmrf(dest);
copyDir(src, dest);
console.log(`[copy-generated] copied ${src} -> ${dest}`);
