import { describe, expect, it } from 'vitest';

import { collectErrorPaths } from './onInvalidToast';

describe('collectErrorPaths', () => {
  it('returns field names only — never values held by refs', () => {
    const input = { value: 'PL1234567890' };
    const errors = {
      nip: { type: 'too_small', message: 'Za krótki', ref: input },
      address: {
        city: { type: 'required', message: 'Wymagane', ref: input },
      },
      files: [undefined, { type: 'custom', message: 'Zły plik' }],
    };
    const paths = collectErrorPaths(errors);
    expect(paths).toEqual(['nip', 'address.city', 'files.1']);
    expect(JSON.stringify(paths)).not.toContain('PL1234567890');
  });

  it('tolerates non-object input', () => {
    expect(collectErrorPaths(null)).toEqual([]);
    expect(collectErrorPaths('x')).toEqual([]);
  });
});
