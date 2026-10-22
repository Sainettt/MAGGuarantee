// Who wrote what (UWAGI #4, 2026-10-22): the verdict → label decision for
// MAGTRANS's decision justification, the blank-text rules, and the labels
// rendered through the REAL message bundles of both surfaces (staff modal +
// carrier detail page) in both locales — proving every key the helper hands
// out exists and that the carrier's note and MAGTRANS's text never share a
// label.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import { describe, expect, it } from 'vitest';
import type { ClaimStatus } from '@magguarantee/shared';

import {
  DECISION_NOTE_LABEL_KEY,
  carrierNote,
  decisionNote,
  decisionVerdict,
  type DecisionVerdict,
} from './claimNotes';

type NoteSource = Parameters<typeof decisionNote>[0] &
  Parameters<typeof carrierNote>[0];

function claim(over: Partial<NoteSource> = {}): NoteSource {
  return {
    status: 'NA_WERYFIKACJI',
    statusBeforeReklamacja: null,
    amountApproved: null,
    comment: null,
    decisionComment: null,
    ...over,
  };
}

function load(locale: 'pl' | 'en'): AbstractIntlMessages {
  const file = fileURLToPath(
    new URL(`../../messages/${locale}.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(file, 'utf8')) as AbstractIntlMessages;
}

function translator(
  locale: 'pl' | 'en',
  namespace:
    | 'employee.claims.modal.notes'
    | 'employee.claims.modal.edit'
    | 'carrier.claims.detail',
) {
  return createTranslator({
    locale,
    messages: load(locale),
    namespace,
    onError: (error) => {
      throw error;
    },
  });
}

describe('decisionVerdict', () => {
  it.each<[ClaimStatus, DecisionVerdict | null]>([
    ['ZAAKCEPTOWANO', 'ZAAKCEPTOWANO'],
    ['ODRZUCONO', 'ODRZUCONO'],
    ['NA_WERYFIKACJI', null],
    ['OCZEKUJE_NA_AUTORYZACJE', null],
  ])('%s → %s', (status, expected) => {
    expect(decisionVerdict(claim({ status }))).toBe(expected);
  });

  it('REKLAMACJA reads the pre-reklamacja verdict', () => {
    expect(
      decisionVerdict(
        claim({ status: 'REKLAMACJA', statusBeforeReklamacja: 'ZAAKCEPTOWANO' }),
      ),
    ).toBe('ZAAKCEPTOWANO');
    expect(
      decisionVerdict(
        claim({ status: 'REKLAMACJA', statusBeforeReklamacja: 'ODRZUCONO' }),
      ),
    ).toBe('ODRZUCONO');
  });

  it('REKLAMACJA with a NULL pre-status falls back on amountApproved', () => {
    expect(
      decisionVerdict(claim({ status: 'REKLAMACJA', amountApproved: 120.5 })),
    ).toBe('ZAAKCEPTOWANO');
    expect(
      decisionVerdict(claim({ status: 'REKLAMACJA', amountApproved: 0 })),
    ).toBe('ZAAKCEPTOWANO');
    expect(decisionVerdict(claim({ status: 'REKLAMACJA' }))).toBe('ODRZUCONO');
  });

  it('REKLAMACJA over an undecided pre-status is not a verdict', () => {
    expect(
      decisionVerdict(
        claim({ status: 'REKLAMACJA', statusBeforeReklamacja: 'NA_WERYFIKACJI' }),
      ),
    ).toBeNull();
  });
});

describe('carrierNote', () => {
  it('returns the carrier text verbatim (line breaks kept)', () => {
    expect(carrierNote(claim({ comment: 'Postój w porcie\n2 dni' }))).toBe(
      'Postój w porcie\n2 dni',
    );
  });

  it.each([null, '', '   ', ' \n\t '])('treats %j as absent', (comment) => {
    expect(carrierNote(claim({ comment }))).toBeNull();
  });
});

describe('decisionNote', () => {
  it('accepted decision → «accepted» label key', () => {
    expect(
      decisionNote(
        claim({ status: 'ZAAKCEPTOWANO', decisionComment: 'Zgodne z tablicą' }),
      ),
    ).toEqual({
      verdict: 'ZAAKCEPTOWANO',
      text: 'Zgodne z tablicą',
      labelKey: 'decisionCommentAccepted',
    });
  });

  it('rejected decision → «rejected» label key', () => {
    expect(
      decisionNote(claim({ status: 'ODRZUCONO', decisionComment: 'Brak CMR' })),
    ).toEqual({
      verdict: 'ODRZUCONO',
      text: 'Brak CMR',
      labelKey: 'decisionCommentRejected',
    });
  });

  it('open reklamacja keeps the label of the original verdict', () => {
    expect(
      decisionNote(
        claim({
          status: 'REKLAMACJA',
          statusBeforeReklamacja: 'ODRZUCONO',
          decisionComment: 'Brak CMR',
        }),
      )?.labelKey,
    ).toBe('decisionCommentRejected');
    expect(
      decisionNote(
        claim({
          status: 'REKLAMACJA',
          statusBeforeReklamacja: 'ZAAKCEPTOWANO',
          decisionComment: 'OK',
        }),
      )?.labelKey,
    ).toBe('decisionCommentAccepted');
  });

  it('an acceptance without text renders nothing', () => {
    expect(decisionNote(claim({ status: 'ZAAKCEPTOWANO' }))).toBeNull();
    expect(
      decisionNote(claim({ status: 'ZAAKCEPTOWANO', decisionComment: '  ' })),
    ).toBeNull();
  });

  it('an undecided claim shows no decision text, even a stray one', () => {
    for (const status of ['NA_WERYFIKACJI', 'OCZEKUJE_NA_AUTORYZACJE'] as const) {
      expect(decisionNote(claim({ status, decisionComment: 'x' }))).toBeNull();
    }
  });

  it('never surfaces the carrier note as MAGTRANS text', () => {
    expect(
      decisionNote(claim({ status: 'ZAAKCEPTOWANO', comment: 'Mój komentarz' })),
    ).toBeNull();
  });
});

describe('labels (real message bundles)', () => {
  const verdicts = Object.keys(DECISION_NOTE_LABEL_KEY) as DecisionVerdict[];

  it.each([
    [
      'pl',
      {
        carrierComment: 'Komentarz przewoźnika',
        ZAAKCEPTOWANO: 'Uzasadnienie decyzji',
        ODRZUCONO: 'Powód odrzucenia',
        acceptInput: 'Uzasadnienie decyzji (opcjonalnie)',
        hint: 'Widoczne dla przewoźnika',
      },
    ],
    [
      'en',
      {
        carrierComment: "Carrier's note",
        ZAAKCEPTOWANO: 'Decision rationale',
        ODRZUCONO: 'Rejection reason',
        acceptInput: 'Decision rationale (optional)',
        hint: 'Visible to the carrier',
      },
    ],
  ] as const)('staff modal — %s', (locale, expected) => {
    const t = translator(locale, 'employee.claims.modal.notes');
    const tEdit = translator(locale, 'employee.claims.modal.edit');
    expect(t('carrierComment')).toBe(expected.carrierComment);
    for (const v of verdicts) {
      expect(t(DECISION_NOTE_LABEL_KEY[v])).toBe(expected[v]);
      expect(t(DECISION_NOTE_LABEL_KEY[v])).not.toBe(t('carrierComment'));
    }
    expect(t('carrierAuthor')).not.toBe(t('magtransAuthor'));
    expect(tEdit('decisionCommentAccepted')).toBe(expected.acceptInput);
    expect(tEdit('decisionCommentVisibleHint')).toBe(expected.hint);
  });

  it.each([
    [
      'pl',
      {
        own: 'Twój komentarz',
        ZAAKCEPTOWANO: 'Uzasadnienie MAGTRANS',
        ODRZUCONO: 'Powód odrzucenia',
      },
    ],
    [
      'en',
      {
        own: 'Your note',
        ZAAKCEPTOWANO: 'MAGTRANS rationale',
        ODRZUCONO: 'Rejection reason',
      },
    ],
  ] as const)('carrier detail — %s', (locale, expected) => {
    const t = translator(locale, 'carrier.claims.detail');
    expect(t('comment')).toBe(expected.own);
    for (const v of verdicts) {
      expect(t(DECISION_NOTE_LABEL_KEY[v])).toBe(expected[v]);
      expect(t(DECISION_NOTE_LABEL_KEY[v])).not.toBe(t('comment'));
    }
  });
});
