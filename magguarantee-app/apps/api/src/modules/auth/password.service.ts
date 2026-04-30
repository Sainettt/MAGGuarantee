import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';

import type { Env } from '../../config/env.schema';
import { DUMMY_BCRYPT_HASH } from './auth.constants';

/**
 * bcrypt wrapper. Rounds = 12 in dev/prod (per docs/15-auth-strategy.md);
 * tests can lower it via env if they need raw speed.
 *
 * `compareConstantTime` always runs a bcrypt.compare even when the input
 * hash is null — feeding a fixed dummy hash. This keeps timing identical
 * between "user not found" and "user found, wrong password" branches, per
 * docs/15-auth-strategy.md#account-enumeration.
 */
@Injectable()
export class PasswordService {
  private readonly rounds: number;

  constructor(config: ConfigService<Env, true>) {
    this.rounds = config.get('BCRYPT_ROUNDS', { infer: true });
  }

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  async compareConstantTime(
    plain: string,
    hash: string | null | undefined,
  ): Promise<boolean> {
    const target = hash && hash.length > 0 ? hash : DUMMY_BCRYPT_HASH;
    const ok = await bcrypt.compare(plain, target);
    // If we hit the dummy path, the comparison should never succeed even by
    // accident. Belt-and-suspenders: if hash was null, return false.
    if (!hash || hash.length === 0) return false;
    return ok;
  }
}
