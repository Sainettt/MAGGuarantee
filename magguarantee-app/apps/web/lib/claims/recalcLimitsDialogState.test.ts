// The confirmation dialog may never offer a write it cannot justify (§16.6).

import { describe, expect, it } from 'vitest';
import type { RecalcLimitsPreviewDto } from '@magguarantee/shared';

import {
  deriveRecalcDialogView,
  type RecalcDialogInput,
} from './recalcLimitsDialogState';

function figures(kmGuaranteed: number, paymentEur: number) {
  return {
    kmGuaranteed,
    kmDifference: kmGuaranteed - 9000,
    paymentEur,
    ratePerKmEffective: 0.5,
    drivenDays: 18,
  };
}

function preview(
  changed: boolean,
  next = figures(5500, 950),
): RecalcLimitsPreviewDto {
  return { changed, current: figures(9000, 1750), next };
}

function input(patch: Partial<RecalcDialogInput> = {}): RecalcDialogInput {
  return {
    previewPending: false,
    previewErrorMessage: null,
    preview: undefined,
    writing: false,
    writeErrorMessage: null,
    ...patch,
  };
}

describe('while the dry run is in flight', () => {
  const view = deriveRecalcDialogView(
    input({ previewPending: true, preview: undefined }),
  );

  it('shows the table with a skeleton in the "after" column', () => {
    expect(view.phase).toBe('loading');
    expect(view.showTable).toBe(true);
    expect(view.showSkeleton).toBe(true);
  });

  it('keeps the confirm visible but NOT clickable', () => {
    expect(view.showConfirm).toBe(true);
    expect(view.confirmDisabled).toBe(true);
  });

  it('shows no delta and no toZero note', () => {
    expect(view.deltaEur).toBeNull();
    expect(view.showToZero).toBe(false);
  });
});

describe('when the dry run is refused (422 status gate)', () => {
  const view = deriveRecalcDialogView(
    input({
      previewErrorMessage:
        'Wniosek został już rozpatrzony — kwota jest zamknięta.',
      preview: undefined,
    }),
  );

  it('REMOVES the confirm — the refusal arrives before any write', () => {
    expect(view.phase).toBe('blocked');
    expect(view.showConfirm).toBe(false);
  });

  it('renders the server text, not an invented one', () => {
    expect(view.errorMessage).toBe(
      'Wniosek został już rozpatrzony — kwota jest zamknięta.',
    );
    expect(view.showTable).toBe(false);
  });
});

describe('when the limits did not move', () => {
  const view = deriveRecalcDialogView(input({ preview: preview(false) }));

  it('offers no write at all', () => {
    expect(view.phase).toBe('unchanged');
    expect(view.showConfirm).toBe(false);
    expect(view.showTable).toBe(false);
    expect(view.deltaEur).toBeNull();
  });
});

describe('when the dry run reports a change', () => {
  const view = deriveRecalcDialogView(input({ preview: preview(true) }));

  it('enables the confirm and shows the signed delta', () => {
    expect(view.phase).toBe('ready');
    expect(view.showConfirm).toBe(true);
    expect(view.confirmDisabled).toBe(false);
    expect(view.deltaEur).toBe(950 - 1750);
  });

  it('warns when the refreshed wniosek would pay nothing', () => {
    expect(view.showToZero).toBe(false);
    const toZero = deriveRecalcDialogView(
      input({ preview: preview(true, figures(0, 0)) }),
    );
    expect(toZero.showToZero).toBe(true);
  });

  it('locks the confirm while the POST is in flight', () => {
    const writing = deriveRecalcDialogView(
      input({ preview: preview(true), writing: true }),
    );
    expect(writing.showConfirm).toBe(true);
    expect(writing.confirmDisabled).toBe(true);
  });

  it('keeps the confirm after a failed POST so a retry is one click', () => {
    const failed = deriveRecalcDialogView(
      input({
        preview: preview(true),
        writeErrorMessage: 'Nie udało się przeliczyć wniosku',
      }),
    );
    expect(failed.showConfirm).toBe(true);
    expect(failed.confirmDisabled).toBe(false);
    expect(failed.errorMessage).toBe('Nie udało się przeliczyć wniosku');
  });
});
