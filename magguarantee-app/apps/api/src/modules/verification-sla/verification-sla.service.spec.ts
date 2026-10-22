// docs/21-pracownik-verification-sla.md §5 — daily verification-SLA digest
// cron tests. Hand-rolled fakes over `jest.fn`. We exercise the cron body
// (`runDailyDigest`) directly with an injected `now` and assert: sends when
// at-risk claims exist, sends nothing when none, and that a single failing
// recipient address does not abort the rest (Promise.allSettled). Since
// 2026-10-22 (docs/21 §1) REKLAMACJA claims share the clock and the lists.

import { Logger } from '@nestjs/common';

import {
  addPolishWorkingDays,
  isPolishWorkingDay,
  SLA_WORKING_DAYS,
} from '@magguarantee/shared';

import type { OpsAlertService } from '../../common/ops-alert/ops-alert.service';
import type { MailService } from '../mail/mail.service';
import type {
  DigestRecipientRow,
  SlaDigestCandidateRow,
  VerificationSlaRepository,
} from './verification-sla.repository';
import { VerificationSlaService } from './verification-sla.service';

const NOW = new Date(2026, 5, 10); // Wed 2026-06-10

/** Walk `n` Polish working days backward from `date` (anchor day excluded). */
function subtractPolishWorkingDays(date: Date, n: number): Date {
  const cursor = new Date(date);
  let remaining = n;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() - 1);
    if (isPolishWorkingDay(cursor)) remaining -= 1;
  }
  return cursor;
}

/**
 * Anchor whose `bucketForAnchor(anchor, NOW).workingDaysLeft === k`. See the
 * matching helper in `diagnostics.service.sla.spec.ts` for the derivation.
 */
function anchorForLeft(k: number): Date {
  const deadline =
    k >= 0
      ? addPolishWorkingDays(NOW, k)
      : subtractPolishWorkingDays(NOW, -k);
  return subtractPolishWorkingDays(deadline, SLA_WORKING_DAYS);
}

let seq = 0;
function makeCandidate(
  overrides: Partial<SlaDigestCandidateRow> = {},
): SlaDigestCandidateRow {
  seq += 1;
  return {
    nrZgl: `GWA/${String(seq).padStart(3, '0')}/05/26`,
    status: 'NA_WERYFIKACJI',
    carrierName: 'TransLogis Sp. z o.o.',
    vehiclePlate: 'WX12345',
    anchorDate: anchorForLeft(0),
    ...overrides,
  };
}

interface Harness {
  service: VerificationSlaService;
  sendVerificationDigest: jest.Mock;
  findCandidates: jest.Mock;
  findRecipients: jest.Mock;
  alertSend: jest.Mock;
}

function makeHarness(opts: {
  candidates?: SlaDigestCandidateRow[];
  recipients?: DigestRecipientRow[];
  sendImpl?: (email: string) => Promise<void>;
}): Harness {
  const findCandidates = jest.fn(async () => opts.candidates ?? []);
  const findRecipients = jest.fn(async () => opts.recipients ?? []);
  const repo = {
    findOnSlaClock: findCandidates,
    findActivePracownikRecipients: findRecipients,
  } as unknown as VerificationSlaRepository;

  const sendVerificationDigest: jest.Mock = jest.fn(
    opts.sendImpl ?? (async () => undefined),
  );
  // The cron path enqueues; with no BullMQ queue in the real service this
  // falls back to a sync send, so the fake's enqueue delegates to the send
  // mock — existing assertions on `sendVerificationDigest` stay valid.
  const enqueueVerificationDigest: jest.Mock = jest.fn(
    (email: string, props: unknown) =>
      sendVerificationDigest(email, props) as Promise<void>,
  );
  const mail = {
    sendVerificationDigest,
    enqueueVerificationDigest,
  } as unknown as MailService;

  const config = {
    get: jest.fn((key: string) =>
      key === 'APP_URL' ? 'http://localhost:3000' : undefined,
    ),
  } as never;

  const alertSend = jest.fn(async () => 'log-only');
  const alerts = { send: alertSend } as unknown as OpsAlertService;

  const service = new VerificationSlaService(repo, mail, config, alerts);
  return {
    service,
    sendVerificationDigest,
    findCandidates,
    findRecipients,
    alertSend,
  };
}

describe('VerificationSlaService.runDailyDigest', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('sends ONE digest per recipient when at-risk claims exist', async () => {
    const h = makeHarness({
      candidates: [
        makeCandidate({ nrZgl: 'OVERDUE', anchorDate: anchorForLeft(-2) }),
        makeCandidate({ nrZgl: 'DUESOON', anchorDate: anchorForLeft(1) }),
        makeCandidate({ nrZgl: 'ONTRACK', anchorDate: anchorForLeft(6) }),
      ],
      recipients: [
        { email: 'a@magtrans.eu', name: 'Anna' },
        { email: 'b@magtrans.eu', name: 'Bartek' },
      ],
    });

    await h.service.runDailyDigest(NOW);

    expect(h.sendVerificationDigest).toHaveBeenCalledTimes(2);
    const [, props] = h.sendVerificationDigest.mock.calls[0] as [
      string,
      { overdue: { nrZgl: string }[]; dueSoon: { nrZgl: string }[] },
    ];
    // overdue + dueSoon present; onTrack excluded.
    expect(props.overdue.map((r) => r.nrZgl)).toEqual(['OVERDUE']);
    expect(props.dueSoon.map((r) => r.nrZgl)).toEqual(['DUESOON']);
    expect([...props.overdue, ...props.dueSoon].map((r) => r.nrZgl)).not.toContain(
      'ONTRACK',
    );
  });

  it('orders overdue (most overdue first) then dueSoon within the digest', async () => {
    const h = makeHarness({
      candidates: [
        makeCandidate({ nrZgl: 'O--1', anchorDate: anchorForLeft(-1) }),
        makeCandidate({ nrZgl: 'O--4', anchorDate: anchorForLeft(-4) }),
        makeCandidate({ nrZgl: 'D-3', anchorDate: anchorForLeft(3) }),
        makeCandidate({ nrZgl: 'D-0', anchorDate: anchorForLeft(0) }),
      ],
      recipients: [{ email: 'a@magtrans.eu', name: 'Anna' }],
    });

    await h.service.runDailyDigest(NOW);

    const [, props] = h.sendVerificationDigest.mock.calls[0] as [
      string,
      {
        overdue: { nrZgl: string; workingDaysLeft: number }[];
        dueSoon: { nrZgl: string; workingDaysLeft: number }[];
      },
    ];
    expect(props.overdue.map((r) => r.nrZgl)).toEqual(['O--4', 'O--1']);
    expect(props.dueSoon.map((r) => r.nrZgl)).toEqual(['D-0', 'D-3']);
  });

  it('sends NOTHING when no claims are overdue or due-soon (stateless, no all-clear)', async () => {
    const h = makeHarness({
      candidates: [
        makeCandidate({ anchorDate: anchorForLeft(5) }),
        makeCandidate({ anchorDate: anchorForLeft(9) }),
      ],
      recipients: [{ email: 'a@magtrans.eu', name: 'Anna' }],
    });

    await h.service.runDailyDigest(NOW);

    expect(h.sendVerificationDigest).not.toHaveBeenCalled();
    // Recipients are not even queried when there is nothing at risk.
    expect(h.findRecipients).not.toHaveBeenCalled();
  });

  it('sends NOTHING when there are zero on-the-clock claims', async () => {
    const h = makeHarness({ candidates: [], recipients: [] });

    await h.service.runDailyDigest(NOW);

    expect(h.sendVerificationDigest).not.toHaveBeenCalled();
  });

  it('skips dispatch (logs) when at-risk exist but no active pracownik', async () => {
    const h = makeHarness({
      candidates: [makeCandidate({ anchorDate: anchorForLeft(-1) })],
      recipients: [],
    });

    await h.service.runDailyDigest(NOW);

    expect(h.findRecipients).toHaveBeenCalledTimes(1);
    expect(h.sendVerificationDigest).not.toHaveBeenCalled();
  });

  it('tolerates a failing recipient address (Promise.allSettled) and still sends to the rest', async () => {
    const h = makeHarness({
      candidates: [makeCandidate({ anchorDate: anchorForLeft(-1) })],
      recipients: [
        { email: 'good1@magtrans.eu', name: 'Good1' },
        { email: 'bad@magtrans.eu', name: 'Bad' },
        { email: 'good2@magtrans.eu', name: 'Good2' },
      ],
      sendImpl: async (email: string) => {
        if (email === 'bad@magtrans.eu') {
          throw new Error('550 mailbox unavailable');
        }
      },
    });

    // Must resolve (not reject) despite the failing address.
    await expect(h.service.runDailyDigest(NOW)).resolves.toBeUndefined();

    expect(h.sendVerificationDigest).toHaveBeenCalledTimes(3);
    const recipientsSent = h.sendVerificationDigest.mock.calls.map(
      (c) => c[0] as string,
    );
    expect(recipientsSent).toEqual(
      expect.arrayContaining([
        'good1@magtrans.eu',
        'bad@magtrans.eu',
        'good2@magtrans.eu',
      ]),
    );
  });

  it('includes REKLAMACJA rows in the same lists, bucketed by their anchor, with status carried', async () => {
    const h = makeHarness({
      candidates: [
        makeCandidate({ nrZgl: 'WER-OVERDUE', anchorDate: anchorForLeft(-1) }),
        makeCandidate({
          nrZgl: 'REK-OVERDUE',
          status: 'REKLAMACJA',
          anchorDate: anchorForLeft(-3),
        }),
        makeCandidate({
          nrZgl: 'REK-SOON',
          status: 'REKLAMACJA',
          anchorDate: anchorForLeft(2),
        }),
        makeCandidate({
          nrZgl: 'REK-ONTRACK',
          status: 'REKLAMACJA',
          anchorDate: anchorForLeft(7),
        }),
      ],
      recipients: [{ email: 'a@magtrans.eu', name: 'Anna' }],
    });

    await h.service.runDailyDigest(NOW);

    expect(h.sendVerificationDigest).toHaveBeenCalledTimes(1);
    const [, props] = h.sendVerificationDigest.mock.calls[0] as [
      string,
      {
        overdue: { nrZgl: string; status: string; workingDaysLeft: number }[];
        dueSoon: { nrZgl: string; status: string; workingDaysLeft: number }[];
      },
    ];
    expect(props.overdue.map((r) => [r.nrZgl, r.status, r.workingDaysLeft])).toEqual([
      ['REK-OVERDUE', 'REKLAMACJA', -3],
      ['WER-OVERDUE', 'NA_WERYFIKACJI', -1],
    ]);
    expect(props.dueSoon.map((r) => [r.nrZgl, r.status, r.workingDaysLeft])).toEqual([
      ['REK-SOON', 'REKLAMACJA', 2],
    ]);
    expect([...props.overdue, ...props.dueSoon].map((r) => r.nrZgl)).not.toContain(
      'REK-ONTRACK',
    );
  });

  it('sends a digest when only REKLAMACJA claims are at risk', async () => {
    const h = makeHarness({
      candidates: [
        makeCandidate({
          nrZgl: 'REK-ONLY',
          status: 'REKLAMACJA',
          anchorDate: anchorForLeft(0),
        }),
      ],
      recipients: [{ email: 'a@magtrans.eu', name: 'Anna' }],
    });

    await h.service.runDailyDigest(NOW);

    expect(h.sendVerificationDigest).toHaveBeenCalledTimes(1);
    const [, props] = h.sendVerificationDigest.mock.calls[0] as [
      string,
      { overdue: unknown[]; dueSoon: { nrZgl: string; status: string }[] },
    ];
    expect(props.overdue).toEqual([]);
    expect(props.dueSoon).toEqual([
      expect.objectContaining({ nrZgl: 'REK-ONLY', status: 'REKLAMACJA' }),
    ]);
  });

  it('builds the deeplink against APP_URL pointing at the pracownik dashboard', async () => {
    const h = makeHarness({
      candidates: [makeCandidate({ anchorDate: anchorForLeft(-1) })],
      recipients: [{ email: 'a@magtrans.eu', name: 'Anna' }],
    });

    await h.service.runDailyDigest(NOW);

    const [, props] = h.sendVerificationDigest.mock.calls[0] as [
      string,
      { deeplink: string },
    ];
    expect(props.deeplink).toBe('http://localhost:3000/employee/dashboard');
  });

  it('falls back to «—» for a null carrier name / plate', async () => {
    const h = makeHarness({
      candidates: [
        makeCandidate({
          nrZgl: 'NULLS',
          carrierName: null,
          vehiclePlate: null,
          anchorDate: anchorForLeft(-1),
        }),
      ],
      recipients: [{ email: 'a@magtrans.eu', name: 'Anna' }],
    });

    await h.service.runDailyDigest(NOW);

    const [, props] = h.sendVerificationDigest.mock.calls[0] as [
      string,
      { overdue: { carrierName: string; vehiclePlate: string }[] },
    ];
    expect(props.overdue[0]?.carrierName).toBe('—');
    expect(props.overdue[0]?.vehiclePlate).toBe('—');
  });
});

describe('VerificationSlaService — failure visibility (logging audit items 11 / 20)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs each rejected recipient with a masked address and the reason', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const h = makeHarness({
      candidates: [makeCandidate({ anchorDate: anchorForLeft(-1) })],
      recipients: [
        { email: 'good@magtrans.eu', name: 'Good' },
        { email: 'bartek.bad@magtrans.eu', name: 'Bad' },
      ],
      sendImpl: async (email: string) => {
        if (email.startsWith('bartek')) {
          throw new Error('Redis connection lost for bartek.bad@magtrans.eu');
        }
      },
    });

    await h.service.runDailyDigest(NOW);

    const rejected = warn.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((l) => l.msg === 'verification digest: enqueue rejected for recipient');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      toMasked: 'ba***@magtrans.eu',
      errorName: 'Error',
    });
    // Neither the log field nor the scrubbed message carries the full address.
    expect(JSON.stringify(rejected[0])).not.toContain('bartek.bad@');
  });

  it('a repository crash is caught: structured ERROR + ops alert, never rejects', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const h = makeHarness({});
    h.findCandidates.mockRejectedValueOnce(new Error('connection terminated'));

    await expect(h.service.runDailyDigest(NOW)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toMatchObject({
      msg: 'cron job failed',
      job: 'verification-sla-digest',
      errorName: 'Error',
      errorMessage: 'connection terminated',
    });
    expect((error.mock.calls[0]?.[0] as { durationMs: unknown }).durationMs).toEqual(
      expect.any(Number),
    );
    expect(h.alertSend).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'cron-failed:verification-sla-digest' }),
    );
  });
});
