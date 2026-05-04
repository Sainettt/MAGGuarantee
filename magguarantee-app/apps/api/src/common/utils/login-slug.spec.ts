import { buildLoginSlug } from './login-slug';

describe('buildLoginSlug', () => {
  it('lowercases and joins first.last', () => {
    expect(buildLoginSlug('Jan', 'Kowalski')).toBe('jan.kowalski');
  });

  it('strips Polish diacritics (NFD path)', () => {
    expect(buildLoginSlug('Łukasz', 'Żółć')).toBe('lukasz.zolc');
  });

  it('strips ł / Ł explicitly', () => {
    expect(buildLoginSlug('Wojciech', 'Łazarek')).toBe('wojciech.lazarek');
  });

  it('replaces spaces inside names with dot', () => {
    expect(buildLoginSlug('Anna Maria', 'Nowak')).toBe('anna.maria.nowak');
  });

  it('replaces non-ASCII non-letter chars with hyphen and trims', () => {
    expect(buildLoginSlug('John', 'O Brien')).toBe('john.o.brien');
  });

  it('falls back to "driver" when both names empty', () => {
    expect(buildLoginSlug('', '')).toBe('driver');
  });

  it('does not produce double-dot for empty middle', () => {
    expect(buildLoginSlug('Jan', 'Kowalski')).not.toMatch(/\.\./);
  });
});
