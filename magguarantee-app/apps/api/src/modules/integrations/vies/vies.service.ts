import { Injectable, Logger } from '@nestjs/common';

import type { ViesLookupResponse } from '@magguarantee/shared';

import { RedisService } from '../../redis/redis.service';
import { fetchJsonWithRetry } from '../http-fetch';

const VIES_BASE = 'https://ec.europa.eu/taxation_customs/vies/rest-api';
const CACHE_TTL_SEC = 24 * 60 * 60; // 24h per docs/16#vies-проверка-vat

/**
 * VIES VAT lookup, per docs/16-jobs-and-integrations.md#vies-проверка-vat.
 *
 * Strategy:
 *   - Country + VAT both normalised to upper-case before hitting upstream
 *     and before hashing into the cache key (`vies:{COUNTRY}:{VAT}`).
 *   - Positive responses cached 24h. The upstream rate-limits aggressively;
 *     we don't want to revisit unchanged VAT registrations.
 *   - 4xx propagate as the same status (VIES uses 400 for malformed VAT) with
 *     a generic message + `extensions.code` — never the upstream body.
 *   - Network failures / 5xx exhaust 3 retries then 503 to the caller.
 */
@Injectable()
export class ViesService {
  private readonly logger = new Logger(ViesService.name);

  constructor(private readonly redis: RedisService) {}

  async lookup(country: string, vat: string): Promise<ViesLookupResponse> {
    const c = country.toUpperCase();
    const v = vat.toUpperCase();
    const key = this._cacheKey(c, v);

    const cached = await this._readCache(key);
    if (cached) {
      // VAT number deliberately not logged (2026-09-14 logging audit, item 2).
      this.logger.debug({ msg: 'VIES cache hit', country: c });
      return cached;
    }

    const upstream = await fetchJsonWithRetry(
      `${VIES_BASE}/ms/${c}/vat/${v}`,
      { tag: 'vies' },
    );
    const dto = this._toDto(c, v, upstream);

    // Only cache positive — `valid: false` responses are equally final but the
    // policy doc explicitly says "positive". Keeping the door open for a
    // negative-cache layer later (with shorter TTL).
    if (dto.valid) {
      await this._writeCache(key, dto);
    }

    return dto;
  }

  // ── internals ────────────────────────────────────────────

  private _cacheKey(country: string, vat: string): string {
    return `vies:${country}:${vat}`;
  }

  private async _readCache(key: string): Promise<ViesLookupResponse | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ViesLookupResponse;
    } catch (err) {
      // Corrupt cache value — treat as miss, log so we notice.
      this.logger.warn({
        msg: 'VIES cache parse failure — refetching',
        // The key embeds the VAT number — log only its kind.
        cache: 'vies',
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async _writeCache(
    key: string,
    dto: ViesLookupResponse,
  ): Promise<void> {
    const stamped: ViesLookupResponse = {
      ...dto,
      cachedAt: new Date().toISOString(),
    };
    await this.redis.setex(key, CACHE_TTL_SEC, JSON.stringify(stamped));
  }

  /**
   * Map upstream JSON onto the documented response DTO.
   *
   * The VIES REST endpoint returns:
   *   { isValid, requestDate, userError, name, address, requestIdentifier }
   * (see https://ec.europa.eu/taxation_customs/vies/api/get-status). We pluck
   * the documented subset; anything else is ignored.
   */
  private _toDto(
    country: string,
    vat: string,
    upstream: unknown,
  ): ViesLookupResponse {
    const u =
      upstream && typeof upstream === 'object'
        ? (upstream as Record<string, unknown>)
        : {};
    return {
      countryCode: country,
      vatNumber: vat,
      valid: this._asBool(u.isValid),
      name: this._asNullableString(u.name),
      address: this._asNullableString(u.address),
      requestDate: this._asIsoDateOrNull(u.requestDate),
      cachedAt: null,
    };
  }

  private _asBool(v: unknown): boolean {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v === 'true' || v === 'TRUE';
    return false;
  }

  private _asNullableString(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    if (trimmed === '' || trimmed === '---') return null;
    return trimmed;
  }

  private _asIsoDateOrNull(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    // VIES emits 'YYYY-MM-DD' (sometimes with time). Slice to date for the
    // schema — IsoDateSchema is `z.string().date()`.
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1]! : null;
  }
}
