import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../../../config/env.schema';
import { GpsProviderFactory } from '../gps.config';
import { GpsMockProvider } from '../providers/gps-mock.provider';
import { GpsVendorProvider } from '../providers/gps-vendor.provider';

interface FactoryProvider {
  inject: unknown[];
  useFactory: (
    cfg: ConfigService<Env, true>,
    mock: GpsMockProvider,
    vendor: GpsVendorProvider,
  ) => unknown;
}

function makeConfig(env: Partial<Env>): ConfigService<Env, true> {
  return {
    get: (key: keyof Env) => env[key] as unknown,
  } as unknown as ConfigService<Env, true>;
}

describe('GpsProviderFactory', () => {
  const mock = new GpsMockProvider();
  const vendor = new GpsVendorProvider();
  const factory = (GpsProviderFactory as unknown as FactoryProvider).useFactory;

  it('defaults to mock', () => {
    const cfg = makeConfig({
      GPS_PROVIDER: 'mock',
      GPS_VENDOR_BASE_URL: '',
      GPS_VENDOR_API_KEY: '',
    });
    const out = factory(cfg, mock, vendor);
    expect(out).toBe(mock);
  });

  it('selects vendor when explicitly set + creds present', () => {
    const cfg = makeConfig({
      GPS_PROVIDER: 'vendor',
      GPS_VENDOR_BASE_URL: 'https://vendor.example/api',
      GPS_VENDOR_API_KEY: 'secret',
    });
    const out = factory(cfg, mock, vendor);
    expect(out).toBe(vendor);
  });

  it('falls back to mock when vendor selected without creds', () => {
    const cfg = makeConfig({
      GPS_PROVIDER: 'vendor',
      GPS_VENDOR_BASE_URL: '',
      GPS_VENDOR_API_KEY: '',
    });
    const out = factory(cfg, mock, vendor);
    expect(out).toBe(mock);
  });
});
