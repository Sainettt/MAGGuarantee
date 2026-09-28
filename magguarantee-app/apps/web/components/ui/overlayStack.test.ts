import { describe, expect, it } from 'vitest';

import { isTopOverlay, popOverlay, pushOverlay } from './overlayStack';

describe('overlayStack — Escape closes only the topmost overlay', () => {
  it('the last opened overlay is on top; closing it hands the top back', () => {
    const form = pushOverlay();
    expect(isTopOverlay(form)).toBe(true);

    const request = pushOverlay();
    expect(isTopOverlay(request)).toBe(true);
    expect(isTopOverlay(form)).toBe(false);

    popOverlay(request);
    expect(isTopOverlay(form)).toBe(true);

    popOverlay(form);
    expect(isTopOverlay(form)).toBe(false);
  });

  it('popping out of order (outer closes first) keeps the inner on top', () => {
    const outer = pushOverlay();
    const inner = pushOverlay();
    popOverlay(outer);
    expect(isTopOverlay(inner)).toBe(true);
    popOverlay(inner);
    // Idempotent.
    popOverlay(inner);
    expect(isTopOverlay(inner)).toBe(false);
  });
});
