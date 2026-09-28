import { describe, expect, it } from 'vitest';

import { marker, splitMarked } from './interpolateNodes';

describe('marker / splitMarked', () => {
  it('keeps the locale word order around the placeholders', () => {
    const pl = `od ${marker('from')}`;
    expect(splitMarked(pl)).toEqual(['od ', { name: 'from' }, '']);

    const range = `${marker('from')} – ${marker('to')}`;
    expect(splitMarked(range)).toEqual(['', { name: 'from' }, ' – ', { name: 'to' }, '']);
  });

  it('a message without markers is one literal part', () => {
    expect(splitMarked('Obecnie')).toEqual(['Obecnie']);
  });
});
