// BugBot handoff — signs the one-time sign-in token for the current user.
//
// Contract: MAGGuaranteeBugBot docs/06-contracts.md §1 (summary in
// docs/16-jobs-and-integrations.md#bugbot-handoff). The flow: the user clicks
// "Zgłoś problem" / "Zgłoś pomysł" → this service signs a 60-second ES256 JWT →
// the web opens `<BUGBOT_URL>/p/<slug>/auth/callback?token=…` in a new tab →
// BugBot verifies it with the public key registered under our `kid`.
//
// Everything that says WHO the user is (`sub`, `email`, `name`, `roles`) comes
// from the server-side session (`AuthUser`, DB-sourced in JwtAccessStrategy);
// the request only picks `kind` and `locale`.
//
// The token and the URL carrying it are a sign-in credential for 60 seconds.
// Neither is logged, at any level: the one log line is `{ userId, kind }`.

import { randomUUID } from 'node:crypto';

import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';

import type {
  BugbotHandoffKind,
  BugbotHandoffLocale,
  BugbotHandoffQuery,
  BugbotHandoffResponse,
  Role,
} from '@magguarantee/shared';

import type { Env } from '../../../config/env.schema';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import {
  BUGBOT_HANDOFF_ALGORITHM,
  BUGBOT_HANDOFF_AUDIENCE,
  BUGBOT_HANDOFF_EMAIL_MAX,
  BUGBOT_HANDOFF_NAME_MAX,
  BUGBOT_HANDOFF_TTL_SEC,
} from './bugbot-handoff.constants';

/** Deployment values, all present — or the integration is off. */
interface BugbotSettings {
  /** BUGBOT_URL without trailing slashes. */
  baseUrl: string;
  slug: string;
  kid: string;
  /** Ready PEM — env.schema.ts already turned literal `\n` into newlines. */
  privateKey: string;
}

/**
 * Private claims of the token. The registered ones (`iss`, `aud`, `sub`, `iat`,
 * `exp`, `jti`) are set through the sign options. Nothing beyond this list is
 * sent — BugBot ignores unknown claims, but the token travels in a URL.
 */
interface HandoffClaims {
  email?: string;
  name?: string;
  roles: Role[];
  locale: BugbotHandoffLocale;
  kind: BugbotHandoffKind;
}

/**
 * Same check BugBot applies (`z.string().email().max(254)`). An address that
 * fails it is left out of the token: a bad `email` — even an empty string —
 * makes BugBot refuse the whole token, while an absent one is allowed.
 */
const EmailClaimSchema = z.string().email().max(BUGBOT_HANDOFF_EMAIL_MAX);

@Injectable()
export class BugbotHandoffService {
  private readonly logger = new Logger(BugbotHandoffService.name);
  /**
   * A dedicated signer with NO module options. The JwtService that AuthModule
   * provides is bound to the HS256 access-token secret; this one only ever
   * signs with the ES256 key passed per call.
   */
  private readonly signer = new JwtService({});
  private readonly settings: BugbotSettings | null;

  constructor(config: ConfigService<Env, true>) {
    this.settings = readSettings(config);
    if (!this.settings) {
      this.logger.log({
        msg: 'BugBot handoff is not configured — GET /integrations/bugbot/handoff answers 404',
      });
    }
  }

  /**
   * Signs a handoff token for `user` and returns the BugBot URL carrying it.
   *
   * @throws NotFoundException when BUGBOT_URL / KID / KEY are not configured.
   * @throws ForbiddenException for `kind = idea` by anyone but an admin.
   */
  async createHandoff(
    user: AuthUser,
    query: BugbotHandoffQuery,
  ): Promise<BugbotHandoffResponse> {
    const settings = this._requireSettings();
    this._assertKindAllowed(user, query.kind);
    const token = await this._sign(user, query, settings);
    this.logger.log({ msg: 'bugbot handoff issued', userId: user.sub, kind: query.kind });
    return { url: this._callbackUrl(settings, token) };
  }

  // ── internals ───────────────────────────────────────────

  private _requireSettings(): BugbotSettings {
    if (!this.settings) {
      throw new NotFoundException('Integracja z BugBot nie jest skonfigurowana.');
    }
    return this.settings;
  }

  /**
   * Who may open the ideas form is decided here (contract §1.8); BugBot applies
   * its own access rules on top. Bug reports are open to every role.
   */
  private _assertKindAllowed(user: AuthUser, kind: BugbotHandoffKind): void {
    if (kind === 'idea' && user.role !== 'admin') {
      throw new ForbiddenException(
        'Zgłaszanie pomysłów jest dostępne tylko dla administratorów.',
      );
    }
  }

  private async _sign(
    user: AuthUser,
    query: BugbotHandoffQuery,
    settings: BugbotSettings,
  ): Promise<string> {
    try {
      return await this.signer.signAsync(this._claims(user, query), {
        privateKey: settings.privateKey,
        algorithm: BUGBOT_HANDOFF_ALGORITHM,
        keyid: settings.kid,
        issuer: settings.slug,
        audience: BUGBOT_HANDOFF_AUDIENCE,
        // A UUID (36 chars) — inside BugBot's 1–128 bound by construction.
        subject: String(user.sub),
        jwtid: randomUUID(),
        expiresIn: BUGBOT_HANDOFF_TTL_SEC,
      });
    } catch (err) {
      // Unreachable with a key that passed env validation. Only the error's
      // name/code is logged: the message of a crypto failure describes the key.
      this.logger.error({
        msg: 'bugbot handoff signing failed',
        userId: user.sub,
        err: { name: errorName(err), code: errorCode(err) },
      });
      throw new InternalServerErrorException(
        'Nie udało się przygotować przejścia do BugBot.',
      );
    }
  }

  private _claims(user: AuthUser, query: BugbotHandoffQuery): HandoffClaims {
    const email = emailClaim(user.email);
    const name = nameClaim(user.name);
    return {
      ...(email !== undefined ? { email } : {}),
      ...(name !== undefined ? { name } : {}),
      // The role as is — the `lider` flag is ours and means nothing to BugBot.
      roles: [user.role],
      locale: query.locale,
      kind: query.kind,
    };
  }

  private _callbackUrl(settings: BugbotSettings, token: string): string {
    const path = `/p/${encodeURIComponent(settings.slug)}/auth/callback`;
    return `${settings.baseUrl}${path}?token=${encodeURIComponent(token)}`;
  }
}

// ── pure helpers ──────────────────────────────────────────

function readSettings(config: ConfigService<Env, true>): BugbotSettings | null {
  const url = config.get('BUGBOT_URL', { infer: true });
  const kid = config.get('BUGBOT_HANDOFF_KID', { infer: true });
  const privateKey = config.get('BUGBOT_HANDOFF_PRIVATE_KEY', { infer: true });
  // env.schema.ts enforces all-or-nothing; this is the "nothing" branch.
  if (!url || !kid || !privateKey) return null;
  return {
    baseUrl: url.replace(/\/+$/u, ''),
    slug: config.get('BUGBOT_PROJECT_SLUG', { infer: true }),
    kid,
    privateKey,
  };
}

/** The address when BugBot would accept it, otherwise `undefined` (claim omitted). */
export function emailClaim(email: string | null | undefined): string | undefined {
  if (typeof email !== 'string') return undefined;
  const trimmed = email.trim();
  return EmailClaimSchema.safeParse(trimmed).success ? trimmed : undefined;
}

/**
 * Trimmed display name cut to BugBot's 200 UTF-16 units without splitting a
 * surrogate pair; `undefined` (claim omitted) when nothing is left.
 */
export function nameClaim(name: string | null | undefined): string | undefined {
  if (typeof name !== 'string') return undefined;
  let out = '';
  // `for…of` walks code points, so an emoji is kept or dropped whole.
  for (const ch of name.trim()) {
    if (out.length + ch.length > BUGBOT_HANDOFF_NAME_MAX) break;
    out += ch;
  }
  out = out.trimEnd();
  return out.length > 0 ? out : undefined;
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

function errorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
