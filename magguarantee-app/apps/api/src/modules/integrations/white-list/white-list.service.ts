import { Injectable, Logger } from '@nestjs/common';

import type { WhiteListResponse } from '@magguarantee/shared';

import { RedisService } from '../../redis/redis.service';
import { fetchJsonWithRetry } from '../http-fetch';

const WHITELIST_BASE = 'https://wl-api.mf.gov.pl/api/check';
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
      this.logger.debug({ msg: 'WhiteList cache hit', nip });
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

  // ── internals ────────────────────────────────────────────

  private _cacheKey(nip: string, account: string): string {
    return `whitelist:${nip}:${account}`;
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
        key,
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
}
