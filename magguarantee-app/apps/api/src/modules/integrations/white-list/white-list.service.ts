import { HttpException, Injectable, Logger } from '@nestjs/common';

import type {
  WhiteListResponse,
  WhiteListSearchResponse,
} from '@magguarantee/shared';

import { RedisService } from '../../redis/redis.service';
import { fetchJsonWithRetry } from '../http-fetch';

const WHITELIST_BASE = 'https://wl-api.mf.gov.pl/api/check';
const WHITELIST_SEARCH_BASE = 'https://wl-api.mf.gov.pl/api/search/nip';
const CACHE_TTL_SEC = 60 * 60; // 1h per docs/16#biała-лиcта-mf

/**
 * Biała Lista MF (Polish Ministry of Finance white-list) lookup, per
 * docs/16-jobs-and-integrations.md#biała-лиcта-mf.
 *
 * Strategy mirrors VIES with shorter TTL — the white-list refreshes more
 * often than VAT registries.
 *
 * Cache key: `whitelist:{NIP}:{ACCOUNT}` — the date param is "today" so we
 * intentionally don't include it in the key (TTL = 1h means we never cache
 * across day boundaries in practice).
 */
@Injectable()
export class WhiteListService {
  private readonly logger = new Logger(WhiteListService.name);

  constructor(private readonly redis: RedisService) {}

  async checkAccount(nip: string, account: string): Promise<WhiteListResponse> {
    const key = this._cacheKey(nip, account);

    const cached = await this._readCache(key);
    if (cached) {
      // NIP / account deliberately not logged (2026-09-14 logging audit, item 2).
      this.logger.debug({ msg: 'WhiteList cache hit' });
      return cached;
    }

    const today = this._todayWarsaw();
    const url = `${WHITELIST_BASE}/nip/${nip}/bank-account/${account}?date=${today}`;
    const upstream = await fetchJsonWithRetry(url, { tag: 'whitelist' });
    const dto = this._toDto(nip, account, upstream);

    if (dto.accountAssigned) {
      await this._writeCache(key, dto);
    }

    return dto;
  }

  /**
   * Search the MF registry by NIP and return the flattened subject
   * (name, address, account numbers, VAT status) for auto-fill of the
   * carrier-creation form.
   *
   * Behaviour:
   *   - Upstream 200 + `result.subject` populated → `{ found: true, ... }`
   *     and cache the result.
   *   - Upstream 200 + `result.subject === null` → `{ found: false, ... }`
   *     (NIP recognised but not on the white-list — don't cache, status
   *     can flip on the next day).
   *   - Upstream 404 (NIP outside the MF registry, e.g. a foreign tax id)
   *     → `{ found: false, ... }`. Treated as a valid "no match", NOT
   *     as a transport error. The carrier UI falls back to manual entry.
   *   - 5xx / network → propagates via `fetchJsonWithRetry` (3 retries →
   *     HttpException 503 surfaces to the caller).
   *
   * Cache key: `whitelist-search:{NIP}` — same rationale as
   * `checkAccount`: the `date` param is "today" and TTL = 1h, so we
   * don't include the date in the key.
   */
  async searchByNip(nip: string): Promise<WhiteListSearchResponse> {
    const key = this._searchCacheKey(nip);

    const cached = await this._readSearchCache(key);
    if (cached) {
      this.logger.debug({ msg: 'WhiteList search cache hit' });
      return cached;
    }

    const today = this._todayWarsaw();
    const url = `${WHITELIST_SEARCH_BASE}/${nip}?date=${today}`;
    const upstream = await this._fetchSearch(url);
    const dto = this._toSearchDto(nip, upstream);

    if (dto.found) {
      await this._writeSearchCache(key, dto);
    }

    return dto;
  }

  // ── internals ────────────────────────────────────────────

  private _cacheKey(nip: string, account: string): string {
    return `whitelist:${nip}:${account}`;
  }

  private _searchCacheKey(nip: string): string {
    return `whitelist-search:${nip}`;
  }

  /**
   * Wraps `fetchJsonWithRetry` to swallow upstream 404. The shared
   * helper throws `HttpException` on any 4xx — we want 404 (NIP not in
   * the MF registry) to flow through as a domain-level "not found"
   * (`null` here, mapped to `{ found: false }` by the caller).
   *
   * Any non-404 4xx (e.g. 400 on a malformed NIP) re-throws as-is so
   * the RFC 7807 filter renders it cleanly to the API consumer.
   */
  private async _fetchSearch(url: string): Promise<unknown> {
    try {
      return await fetchJsonWithRetry(url, { tag: 'whitelist-search' });
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === 404) {
        return null;
      }
      throw err;
    }
  }

  private _todayWarsaw(): string {
    // MF expects 'YYYY-MM-DD'. Server clock is fine; we deliberately don't
    // tz-shift — the white-list is keyed on the calendar day and the api is
    // run from CEST/CET infra anyway.
    return new Date().toISOString().slice(0, 10);
  }

  private async _readCache(key: string): Promise<WhiteListResponse | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as WhiteListResponse;
    } catch (err) {
      this.logger.warn({
        msg: 'WhiteList cache parse failure — refetching',
        // The key embeds NIP + account — log only its kind.
        cache: 'whitelist',
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async _writeCache(
    key: string,
    dto: WhiteListResponse,
  ): Promise<void> {
    const stamped: WhiteListResponse = {
      ...dto,
      cachedAt: new Date().toISOString(),
    };
    await this.redis.setex(key, CACHE_TTL_SEC, JSON.stringify(stamped));
  }

  private async _readSearchCache(
    key: string,
  ): Promise<WhiteListSearchResponse | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as WhiteListSearchResponse;
    } catch (err) {
      this.logger.warn({
        msg: 'WhiteList search cache parse failure — refetching',
        cache: 'whitelist-search',
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async _writeSearchCache(
    key: string,
    dto: WhiteListSearchResponse,
  ): Promise<void> {
    const stamped: WhiteListSearchResponse = {
      ...dto,
      cachedAt: new Date().toISOString(),
    };
    await this.redis.setex(key, CACHE_TTL_SEC, JSON.stringify(stamped));
  }

  /**
   * Upstream payload (per https://wl-api.mf.gov.pl):
   *   {
   *     "result": {
   *       "accountAssigned": "TAK" | "NIE" | "NIE_NA_BIALEJ_LISCIE",
   *       "requestId": "...",
   *       "requestDateTime": "..."
   *     }
   *   }
   *
   * We flatten and coerce `accountAssigned` to a boolean (TRUE iff "TAK").
   * The raw string is preserved for diagnostics.
   */
  private _toDto(
    nip: string,
    account: string,
    upstream: unknown,
  ): WhiteListResponse {
    const root =
      upstream && typeof upstream === 'object'
        ? (upstream as Record<string, unknown>)
        : {};
    const result =
      root.result && typeof root.result === 'object'
        ? (root.result as Record<string, unknown>)
        : {};

    const raw =
      typeof result.accountAssigned === 'string'
        ? result.accountAssigned
        : null;
    return {
      nip,
      account,
      accountAssigned: raw === 'TAK',
      accountAssignedRaw: raw,
      requestId:
        typeof result.requestId === 'string' ? result.requestId : null,
      requestDateTime:
        typeof result.requestDateTime === 'string'
          ? result.requestDateTime
          : null,
      cachedAt: null,
    };
  }

  /**
   * Upstream payload for `/api/search/nip/{NIP}` (per https://wl-api.mf.gov.pl):
   *   {
   *     "result": {
   *       "subject": {
   *         "name": "...",
   *         "nip": "...",
   *         "statusVat": "Czynny" | "Niezarejestrowany" | "Zwolniony",
   *         "residenceAddress": "...",
   *         "workingAddress": "...",
   *         "accountNumbers": ["...", "..."]
   *       } | null,
   *       "requestId": "...",
   *       "requestDateTime": "..."
   *     }
   *   }
   *
   * `upstream === null` is our sentinel for upstream 404 (see
   * `_fetchSearch`) — it produces a `{ found: false }` DTO indistinguishable
   * from `result.subject === null`. That's intentional: from the caller's
   * POV, both mean "no MF record for this NIP".
   */
  private _toSearchDto(
    nip: string,
    upstream: unknown,
  ): WhiteListSearchResponse {
    const root =
      upstream && typeof upstream === 'object'
        ? (upstream as Record<string, unknown>)
        : {};
    const result =
      root.result && typeof root.result === 'object'
        ? (root.result as Record<string, unknown>)
        : {};
    const subject =
      result.subject && typeof result.subject === 'object'
        ? (result.subject as Record<string, unknown>)
        : null;

    const requestId =
      typeof result.requestId === 'string' ? result.requestId : null;
    const requestDateTime =
      typeof result.requestDateTime === 'string'
        ? result.requestDateTime
        : null;

    if (!subject) {
      return {
        found: false,
        nip,
        name: null,
        address: null,
        accountNumbers: [],
        statusVat: null,
        requestId,
        requestDateTime,
        cachedAt: null,
      };
    }

    const name = typeof subject.name === 'string' ? subject.name : null;
    const residenceAddress =
      typeof subject.residenceAddress === 'string'
        ? subject.residenceAddress
        : null;
    const workingAddress =
      typeof subject.workingAddress === 'string'
        ? subject.workingAddress
        : null;
    const statusVat =
      typeof subject.statusVat === 'string' ? subject.statusVat : null;
    const accountNumbers = Array.isArray(subject.accountNumbers)
      ? subject.accountNumbers.filter(
          (v): v is string => typeof v === 'string',
        )
      : [];

    return {
      found: true,
      nip,
      name,
      address: residenceAddress ?? workingAddress,
      accountNumbers,
      statusVat,
      requestId,
      requestDateTime,
      cachedAt: null,
    };
  }
}
