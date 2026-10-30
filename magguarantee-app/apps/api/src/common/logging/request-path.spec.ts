import {
  routeForLog,
  routeTemplate,
  sanitizePath,
  stripQuery,
} from './request-path';

describe('request-path', () => {
  describe('stripQuery', () => {
    it('drops the query string and fragment', () => {
      expect(stripQuery('/api/v1/x?nip=1234567890&account=1')).toBe('/api/v1/x');
      expect(stripQuery('/api/v1/x#frag')).toBe('/api/v1/x');
      expect(stripQuery('/api/v1/x')).toBe('/api/v1/x');
    });
  });

  describe('sanitizePath', () => {
    it('strips the query string', () => {
      expect(
        sanitizePath(
          '/api/v1/integrations/whitelist?nip=1234567890&account=12345678901234567890123456',
        ),
      ).toBe('/api/v1/integrations/whitelist');
    });

    it('masks personal-data-shaped segments', () => {
      expect(sanitizePath('/api/v1/integrations/vies/PL/1234567890')).toBe(
        '/api/v1/integrations/vies/PL/:number',
      );
      expect(sanitizePath('/x/12345678901234567890123456')).toBe('/x/:number');
      expect(sanitizePath('/x/PL1234567890')).toBe('/x/:vat');
      expect(sanitizePath('/x/jan.kowalski%40magtrans.eu')).toBe('/x/:email');
      expect(sanitizePath('/x/jan@magtrans.eu/y')).toBe('/x/:email/y');
      expect(
        sanitizePath('/x/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1LTEifQ.c2lnbmF0dXJlLXZhbHVl'),
      ).toBe('/x/:token');
    });

    it('keeps our own route params untouched', () => {
      const uuid = '3f2c1a9e-7b6d-4e5f-8a9b-0c1d2e3f4a5b';
      expect(sanitizePath(`/api/v1/vehicles/${uuid}/hard`)).toBe(
        `/api/v1/vehicles/${uuid}/hard`,
      );
      expect(sanitizePath('/api/v1/limits/2026-W23')).toBe('/api/v1/limits/2026-W23');
      expect(sanitizePath('/api/v1/claims/GWA%2F001%2F05%2F26')).toBe(
        '/api/v1/claims/GWA%2F001%2F05%2F26',
      );
      expect(sanitizePath('/api/v1/sso/stanowisko-roles/PLANISTA')).toBe(
        '/api/v1/sso/stanowisko-roles/PLANISTA',
      );
    });

    it('survives malformed percent-encoding', () => {
      expect(sanitizePath('/x/%E0%A4%A')).toBe('/x/%E0%A4%A');
    });

    it('caps very long paths', () => {
      const out = sanitizePath(`/${'a/'.repeat(600)}`);
      expect(out.length).toBeLessThanOrEqual(513);
    });
  });

  describe('routeTemplate / routeForLog', () => {
    it('prefers the matched Express route template, with its mount path', () => {
      const req = {
        url: '/api/v1/claims/GWA_1?x=1',
        baseUrl: '',
        route: { path: '/api/v1/claims/:nrZgl' },
      };
      expect(routeTemplate(req)).toBe('/api/v1/claims/:nrZgl');
      expect(routeForLog(req)).toBe('/api/v1/claims/:nrZgl');
      expect(routeForLog({ ...req, baseUrl: '/mounted' })).toBe(
        '/mounted/api/v1/claims/:nrZgl',
      );
    });

    it('falls back to the sanitised originalUrl when nothing matched', () => {
      expect(routeTemplate({ url: '/nope' })).toBeUndefined();
      expect(
        routeForLog({ originalUrl: '/api/v1/nope?email=a@b.pl', url: '/nope' }),
      ).toBe('/api/v1/nope');
      expect(routeForLog({ url: '/nope/1234567890?q=1' })).toBe('/nope/:number');
      expect(routeForLog({})).toBe('');
    });

    it('ignores a route object without a string path', () => {
      expect(routeTemplate({ route: { path: /regex/ } })).toBeUndefined();
      expect(routeTemplate({ route: 'weird' })).toBeUndefined();
    });
  });
});
