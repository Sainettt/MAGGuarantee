// PL (default) ⇄ EN message-bundle parity: every key present in one locale must
// exist in the other, and every leaf must be a non-empty string. Guards the
// docs/14 §8.2 acceptance rule ("PL+EN key parity holds") in CI.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Messages = { [key: string]: string | Messages };

function load(locale: string): Messages {
  const file = fileURLToPath(
    new URL(`../../messages/${locale}.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(file, 'utf8')) as Messages;
}

function flatten(obj: Messages, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      for (const [k, v] of flatten(value, path)) out.set(k, v);
    } else {
      out.set(path, value);
    }
  }
  return out;
}

describe('i18n message bundles', () => {
  const pl = flatten(load('pl'));
  const en = flatten(load('en'));

  it('EN has every PL key', () => {
    expect([...pl.keys()].filter((k) => !en.has(k))).toEqual([]);
  });

  it('PL has every EN key', () => {
    expect([...en.keys()].filter((k) => !pl.has(k))).toEqual([]);
  });

  it('every leaf is a non-empty string', () => {
    const bad = [...pl, ...en]
      .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });
});
