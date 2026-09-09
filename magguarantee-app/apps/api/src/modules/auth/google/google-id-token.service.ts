// Verification of the Google Identity Services `id_token` (docs/24 §A1).
//
// The browser runs the whole Google flow and hands us one signed JWT; this
// service is the entire server side of it. There is no redirect, no `state`,
// no PKCE and no callback route — `OAuth2Client.verifyIdToken` checks the
// signature against Google's rotating JWKS (cached in-process by the library)
// and the standard claims, and we check the rest.
//
// What "the rest" means, and why each check is load-bearing:
//
//   * `aud` — enforced by the library because we pass `audience`. Without it a
//     token minted for ANY other Google client would verify: the signature is
//     Google's either way.
//   * `iss` — must be Google. The library accepts both the bare and the
//     https:// spelling; we assert it anyway so a future library change cannot
//     silently widen this.
//   * `exp` — enforced by the library.
//   * `email_verified` — a Workspace admin can create an account whose primary
//     address is unverified; matching an employee on an unverified address is
//     the same as not checking the address at all.
//   * `hd` — THE domain check. `email` ending in "@magtrans.eu" is not
//     equivalent: `hd` is asserted by Google Workspace, the local part of an
//     e-mail is not, and a personal @gmail.com account can carry any `email`
//     value the user managed to verify. A token with no `hd` at all is a
//     consumer account and is rejected.
//
// Everything that fails becomes one 403 with `SSO_DOMAIN_NOT_ALLOWED`: from the
// outside "your Google account is not one we accept" is a single condition, and
// distinguishing "expired" from "wrong audience" for the caller only helps
// someone probing the endpoint. The reason is logged, never returned.

import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';

import { SSO_DOMAIN_NOT_ALLOWED, SSO_NOT_CONFIGURED } from '@magguarantee/shared';

import type { Env } from '../../../config/env.schema';

/** Both spellings Google uses for the `iss` claim. */
const GOOGLE_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com',
]);

/** The identity we extracted from a token that passed every check. */
export interface GoogleIdentity {
  /** Google's stable subject id. Survives a Workspace e-mail rename. */
  sub: string;
  /** Lower-cased, so it can be compared with MAGSpace's `email` directly. */
  email: string;
  /** Display name, best effort — Google does not guarantee `name`. */
  name: string | null;
}

@Injectable()
export class GoogleIdTokenService {
  private readonly logger = new Logger(GoogleIdTokenService.name);
  private readonly clientId: string | undefined;
  private readonly allowedHd: string;
  /**
   * Built once: the client keeps the fetched JWKS in memory, so a per-request
   * instance would re-fetch Google's certs on every single sign-in.
   */
  private readonly client: OAuth2Client;

  constructor(config: ConfigService<Env, true>) {
    this.clientId = config.get('GOOGLE_OAUTH_CLIENT_ID', { infer: true });
    this.allowedHd = config.get('SSO_ALLOWED_HD', { infer: true });
    this.client = new OAuth2Client(this.clientId);

    if (!this.clientId) {
      // Not fatal: dev, test and any environment without a GCP client must
      // still boot — the password path is untouched.
      this.logger.warn({
        msg: 'GOOGLE_OAUTH_CLIENT_ID is unset — Google sign-in is disabled',
      });
    }
  }

  /** True when the deployment is configured for Google sign-in at all. */
  get isConfigured(): boolean {
    return Boolean(this.clientId);
  }

  /**
   * Verifies the token and returns the identity inside it.
   *
   * @throws ServiceUnavailableException when the feature is not configured.
   * @throws ForbiddenException (`SSO_DOMAIN_NOT_ALLOWED`) for every other
   *         failure — bad signature, wrong audience, expired, unverified or
   *         non-Workspace account.
   */
  async verifyIdToken(idToken: string): Promise<GoogleIdentity> {
    if (!this.clientId) {
      throw new ServiceUnavailableException({
        message: 'Logowanie przez Google nie jest skonfigurowane.',
        extensions: { code: SSO_NOT_CONFIGURED },
      });
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      payload = ticket.getPayload();
    } catch (err) {
      // Signature, `aud`, `exp`, malformed token — all land here.
      this._reject('token verification failed', err);
    }

    if (!payload) this._reject('token carried no payload');
    if (!GOOGLE_ISSUERS.has(payload.iss)) this._reject(`unexpected iss "${payload.iss}"`);
    if (payload.email_verified !== true) this._reject('email_verified is not true');
    if (!payload.email) this._reject('token carried no email');
    // The domain gate. `hd` is absent on consumer accounts — that IS the signal.
    if (payload.hd !== this.allowedHd) {
      this._reject(`hd "${payload.hd ?? '<none>'}" is not "${this.allowedHd}"`);
    }

    return {
      sub: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name: payload.name?.trim() || null,
    };
  }

  /**
   * Logs the real reason and throws the single opaque 403. Returns `never` so
   * TypeScript narrows at every call site.
   */
  private _reject(reason: string, err?: unknown): never {
    this.logger.warn({
      msg: 'google id_token rejected',
      reason,
      // The address is a person's identifier; the reason is enough for triage.
      error: err instanceof Error ? err.message : undefined,
    });
    throw new ForbiddenException({
      message: 'Zaloguj się kontem @magtrans.eu.',
      extensions: { code: SSO_DOMAIN_NOT_ALLOWED },
    });
  }
}
