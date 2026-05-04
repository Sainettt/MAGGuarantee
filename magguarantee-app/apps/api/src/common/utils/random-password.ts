import { randomInt } from 'node:crypto';

/**
 * Generate a random, easy-to-type, policy-compliant password.
 *
 * Policy (docs/15-auth-strategy.md#politika-паролей):
 *  - ≥10 chars, ≥1 letter, ≥1 digit.
 *
 * We use crypto.randomInt — never Math.random — and assemble from a
 * URL-safe alphabet. The result is shown to the admin once via the API
 * response (Phase 2 stub) and emailed in Phase 9.
 */
const ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateRandomPassword(length = 14): string {
  if (length < 10) length = 10;
  // Bias for policy: at least one letter + one digit by construction.
  const chars: string[] = [];
  // First char: letter.
  chars.push(pickRange('letters'));
  // Second char: digit.
  chars.push(pickRange('digits'));
  for (let i = 2; i < length; i += 1) {
    chars.push(ALPHABET[randomInt(0, ALPHABET.length)] ?? 'A');
  }
  // Shuffle so the letter/digit aren't always at fixed positions.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    const tmp = chars[i] ?? '';
    chars[i] = chars[j] ?? '';
    chars[j] = tmp;
  }
  return chars.join('');
}

function pickRange(kind: 'letters' | 'digits'): string {
  if (kind === 'digits') {
    // Skip ambiguous '0' and '1'.
    const digits = '23456789';
    return digits[randomInt(0, digits.length)] ?? '2';
  }
  // Avoid ambiguous chars (I, l, O, 0, 1).
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  return letters[randomInt(0, letters.length)] ?? 'A';
}
