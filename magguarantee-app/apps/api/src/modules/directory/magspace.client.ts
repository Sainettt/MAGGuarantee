// HTTP client for the MAGSpace employee-directory API (docs/24 §A0,
// MAGSpace/docs/07-directory-api.md).
//
// MAGSpace is the source of truth for WHO works at MAGTRANS and on WHICH
// stanowisko. It is reached over the shared docker network `magtrans-internal`
// by container name — the `/internal/*` routes are deliberately unpublished, so
// there is no public URL to fall back on.
//
// Two deliberate departures from the other integrations in this folder:
//
//   * **No retries on the sign-in path.** `fetchJsonWithRetry` defaults to 3
//     attempts with 1 s + 2 s backoff; on a login that would hold the user for
//     seven seconds before failing. `lookupByEmail` therefore uses
//     `attempts: 1`. The reconcile, which nobody is waiting on, keeps retries.
//   * **3 s timeout instead of 10 s**, for the same reason.
//
// Responses are parsed with Zod rather than cast. This is a cross-repository
// contract: a MAGSpace deploy that renames a field must fail loudly here, not
// silently provision people with `undefined` names.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import type { Env } from '../../config/env.schema';
import { fetchJsonWithRetry } from '../integrations/http-fetch';

/** Thrown when MAGSpace could not be reached or answered something unusable. */
export class DirectoryUnavailableError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DirectoryUnavailableError';
  }
}

/** Thrown when MAGSpace answered 404 — no employee card with that address. */
export class EmployeeNotFoundError extends Error {
  constructor() {
    super('No employee with this e-mail');
    this.name = 'EmployeeNotFoundError';
  }
}

/**
 * `EmployeeDto` as MAGSpace serves it.
 *
 * `employedFrom` is NULLABLE — everyone hired before MAGSpace existed has no
 * hire date (their migration deliberately did not invent one). Our contract
 * doc originally typed it non-null; the field is informational either way, we
 * only ever act on `active`.
 *
 * `id` is a **cuid**, not a uuid — do not tighten this to `.uuid()`.
 */
export const MagspaceEmployeeSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  active: z.boolean(),
  // `null` = no stanowisko assigned yet. Treated exactly like "stanowisko with
  // no mapping": no access, fail-closed.
  stanowisko: z
    .object({ code: z.string().min(1), name: z.string() })
    .nullable(),
  employedFrom: z.string().nullable(),
  employedTo: z.string().nullable(),
  updatedAt: z.string(),
});
export type MagspaceEmployee = z.infer<typeof MagspaceEmployeeSchema>;

export const MagspaceEmployeeListSchema = z.object({
  items: z.array(MagspaceEmployeeSchema),
  generatedAt: z.string(),
});
export type MagspaceEmployeeList = z.infer<typeof MagspaceEmployeeListSchema>;

export const MagspaceStanowiskoSchema = z.object({
  code: z.string().min(1),
  name: z.string(),
});
export type MagspaceStanowisko = z.infer<typeof MagspaceStanowiskoSchema>;

export const MagspaceStanowiskaListSchema = z.object({
  items: z.array(MagspaceStanowiskoSchema),
});

/** Sign-in path: fail fast, the user is waiting. */
const LOGIN_TIMEOUT_MS = 3_000;
const LOGIN_ATTEMPTS = 1;
/** Background path: nobody is waiting, so ride out a restart. */
const BACKGROUND_TIMEOUT_MS = 10_000;
const BACKGROUND_ATTEMPTS = 3;

@Injectable()
export class MagspaceClient {
  private readonly logger = new Logger(MagspaceClient.name);
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    // Trailing slash would produce `//internal/v1/...`, which MAGSpace's
    // catch-all answers with 404 rather than routing.
    this.baseUrl = config
      .get('MAGSPACE_API_URL', { infer: true })
      .replace(/\/+$/u, '');
    this.token = config.get('MAGSPACE_INTERNAL_TOKEN', { infer: true });

    if (!this.token) {
      this.logger.warn({
        msg: 'MAGSPACE_INTERNAL_TOKEN is unset — the employee directory is disabled',
      });
    }
  }

  /** True when this deployment can talk to MAGSpace at all. */
  get isConfigured(): boolean {
    return Boolean(this.token);
  }

  /**
   * Looks one employee up by e-mail. MAGSpace trims and lower-cases the query
   * itself, but we normalise here too so the value we later store on the User
   * row matches the one it matched on.
   *
   * The address has to travel in the query string — that is MAGSpace's
   * contract (MAGSpace/docs/07-directory-api.md). It stays out of OUR logs
   * because neither `fetchJsonWithRetry` nor `_get` ever logs the URL; a
   * "not an employee" 404 shows up only as tag + host + status.
   *
   * @throws EmployeeNotFoundError on 404.
   * @throws DirectoryUnavailableError on anything else.
   */
  async lookupByEmail(email: string): Promise<MagspaceEmployee> {
    const normalised = email.trim().toLowerCase();
    const url = `${this.baseUrl}/internal/v1/employees/lookup?email=${encodeURIComponent(normalised)}`;
    const raw = await this._get(url, 'magspace.lookup', {
      timeoutMs: LOGIN_TIMEOUT_MS,
      attempts: LOGIN_ATTEMPTS,
      notFoundIsEmpty: true,
    });
    if (raw === NOT_FOUND) throw new EmployeeNotFoundError();
    return this._parse(MagspaceEmployeeSchema, raw, 'lookup');
  }

  /**
   * The whole roster — active AND terminated, because the reconcile has to tell
   * "left the company" from "never existed" (a row that vanished entirely is a
   * contract violation worth a different reaction than a termination).
   */
  async listAll(): Promise<MagspaceEmployeeList> {
    const raw = await this._get(
      `${this.baseUrl}/internal/v1/employees`,
      'magspace.employees',
      { timeoutMs: BACKGROUND_TIMEOUT_MS, attempts: BACKGROUND_ATTEMPTS },
    );
    return this._parse(MagspaceEmployeeListSchema, raw, 'employees');
  }

  /**
   * Every stanowisko MAGSpace knows, straight from its enum — so the admin
   * mapping UI always shows the complete list, including positions nobody
   * currently holds.
   */
  async listStanowiska(): Promise<MagspaceStanowisko[]> {
    const raw = await this._get(
      `${this.baseUrl}/internal/v1/stanowiska`,
      'magspace.stanowiska',
      { timeoutMs: BACKGROUND_TIMEOUT_MS, attempts: BACKGROUND_ATTEMPTS },
    );
    return this._parse(MagspaceStanowiskaListSchema, raw, 'stanowiska').items;
  }

  /**
   * Liveness probe for `/diagnostics`. Note this endpoint needs the bearer
   * token like every other one — MAGSpace guards the whole `/internal/v1`
   * controller, health included.
   */
  async health(): Promise<boolean> {
    try {
      await this._get(`${this.baseUrl}/internal/v1/health`, 'magspace.health', {
        timeoutMs: LOGIN_TIMEOUT_MS,
        attempts: LOGIN_ATTEMPTS,
      });
      return true;
    } catch {
      return false;
    }
  }

  // ── internals ──────────────────────────────────────────

  private async _get(
    url: string,
    tag: string,
    opts: { timeoutMs: number; attempts: number; notFoundIsEmpty?: boolean },
  ): Promise<unknown> {
    if (!this.token) {
      throw new DirectoryUnavailableError('MAGSPACE_INTERNAL_TOKEN is not configured');
    }
    try {
      return await fetchJsonWithRetry(url, {
        tag,
        timeoutMs: opts.timeoutMs,
        attempts: opts.attempts,
        headers: { Authorization: `Bearer ${this.token}` },
      });
    } catch (err) {
      // `fetchJsonWithRetry` wraps everything as an HttpException carrying the
      // upstream status. A 404 from `lookup` is a normal answer ("not an
      // employee"), everything else — 401 (bad token), 5xx, timeout — means the
      // directory cannot be consulted right now.
      if (opts.notFoundIsEmpty && statusOf(err) === 404) return NOT_FOUND;
      // Tag + status + error class only. Never the URL (`lookup?email=…` carries
      // the employee's address) and never `err.message`, which for non-helper
      // errors can embed request details (2026-09-14 logging audit, item 2).
      this.logger.warn({
        msg: 'magspace request failed',
        tag,
        status: statusOf(err),
        error: err instanceof Error ? err.name : typeof err,
      });
      throw new DirectoryUnavailableError(`MAGSpace ${tag} failed`, err);
    }
  }

  private _parse<T extends z.ZodTypeAny>(
    schema: T,
    raw: unknown,
    what: string,
  ): z.infer<T> {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      // A contract break, not a transient failure — but the caller's options
      // are the same as for "MAGSpace is down", so it takes the same path.
      this.logger.error({
        msg: 'magspace response did not match the contract',
        what,
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      throw new DirectoryUnavailableError(`MAGSpace ${what} response is not contract-shaped`);
    }
    return parsed.data as z.infer<T>;
  }
}

/** Sentinel for "the upstream said 404", distinct from any JSON body. */
const NOT_FOUND = Symbol('magspace.notFound');

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'getStatus' in err) {
    const get = (err as { getStatus: unknown }).getStatus;
    if (typeof get === 'function') return (get as () => number).call(err);
  }
  return undefined;
}
