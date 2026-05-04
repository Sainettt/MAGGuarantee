import { generateRandomPassword } from './random-password';

describe('generateRandomPassword', () => {
  it('returns at least 10 chars even when asked for less', () => {
    const p = generateRandomPassword(4);
    expect(p.length).toBeGreaterThanOrEqual(10);
  });

  it('honours the requested length when ≥10', () => {
    const p = generateRandomPassword(20);
    expect(p.length).toBe(20);
  });

  it('contains at least one digit', () => {
    for (let i = 0; i < 20; i += 1) {
      const p = generateRandomPassword();
      expect(p).toMatch(/[0-9]/);
    }
  });

  it('contains at least one letter', () => {
    for (let i = 0; i < 20; i += 1) {
      const p = generateRandomPassword();
      expect(p).toMatch(/[a-zA-Z]/);
    }
  });

  it('uses only the safe alphabet (no I/l/O/0)', () => {
    for (let i = 0; i < 20; i += 1) {
      const p = generateRandomPassword();
      expect(p).not.toMatch(/[Il0O]/);
    }
  });
});
