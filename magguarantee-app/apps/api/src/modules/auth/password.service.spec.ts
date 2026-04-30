import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { PasswordService } from './password.service';
import { DUMMY_BCRYPT_HASH } from './auth.constants';

function makeService(): PasswordService {
  // We use 4 rounds in unit tests for speed — semantics are unchanged.
  const cfg = {
    get: (key: string) => {
      if (key === 'BCRYPT_ROUNDS') return 4;
      return undefined;
    },
  } as unknown as ConfigService<Env, true>;
  return new PasswordService(cfg);
}

describe('PasswordService', () => {
  it('hashes and verifies a password correctly', async () => {
    const svc = makeService();
    const hash = await svc.hash('Test1234!');
    expect(hash).not.toBe('Test1234!');
    expect(hash.startsWith('$2')).toBe(true);
    expect(await svc.compareConstantTime('Test1234!', hash)).toBe(true);
    expect(await svc.compareConstantTime('wrong', hash)).toBe(false);
  });

  it('returns false for null hash but still runs bcrypt against dummy', async () => {
    const svc = makeService();
    const t0 = Date.now();
    const ok = await svc.compareConstantTime('anything', null);
    const elapsed = Date.now() - t0;
    expect(ok).toBe(false);
    // Should have actually run bcrypt — > 1ms even at 4 rounds.
    expect(elapsed).toBeGreaterThan(0);
  });

  it('uses the dummy hash format', () => {
    expect(DUMMY_BCRYPT_HASH.startsWith('$2')).toBe(true);
  });
});
