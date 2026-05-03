import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../../config/env.schema';
import { GpsMockProvider } from './providers/gps-mock.provider';
import { GpsVendorProvider } from './providers/gps-vendor.provider';
import type { GpsProvider } from './gps.types';

/**
 * DI token for the active GPS provider. Controllers / services inject by
 * the symbol — the underlying impl swaps based on `GPS_PROVIDER` at boot.
 */
export const GPS_PROVIDER_TOKEN = Symbol('GpsProvider');

const log = new Logger('GpsConfig');

/**
 * Factory provider — selects mock or vendor based on env at module init.
 *
 * Per docs/16-jobs-and-integrations.md#конфигурация-env:
 *   - default `GPS_PROVIDER=mock` so dev / test never hits the vendor stub.
 *   - vendor mode requires `GPS_VENDOR_BASE_URL` / `GPS_VENDOR_API_KEY` set;
 *     missing creds while in vendor mode is a config error and we'd rather
 *     fail fast at boot than at the first request.
 *
 * The factory is exported as a `Provider` so the module file is a one-liner.
 */
export const GpsProviderFactory: Provider = {
  provide: GPS_PROVIDER_TOKEN,
  inject: [ConfigService, GpsMockProvider, GpsVendorProvider],
  useFactory: (
    config: ConfigService<Env, true>,
    mock: GpsMockProvider,
    vendor: GpsVendorProvider,
  ): GpsProvider => {
    const choice = config.get('GPS_PROVIDER', { infer: true });
    if (choice === 'vendor') {
      const baseUrl = config.get('GPS_VENDOR_BASE_URL', { infer: true });
      const apiKey = config.get('GPS_VENDOR_API_KEY', { infer: true });
      if (!baseUrl || !apiKey) {
        log.warn({
          msg: 'GPS_PROVIDER=vendor but credentials missing — falling back to mock',
        });
        return mock;
      }
      log.log({ msg: 'GPS provider selected: vendor', baseUrl });
      return vendor;
    }
    log.log({ msg: 'GPS provider selected: mock' });
    return mock;
  },
};
