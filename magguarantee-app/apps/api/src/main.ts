import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<Env, true>);

  // Trust N proxy hops — required for ThrottlerGuard and the audit interceptor
  // to read the real client IP out of X-Forwarded-For. The count is env-driven
  // because the chain differs per environment: 1 hop on staging (Caddy alone),
  // 2 in production (corporate nginx → Caddy). See TRUST_PROXY_HOPS in
  // config/env.schema.ts for why an over-count is a spoofing hole.
  // express-style: `app.set('trust proxy', n)` via the underlying instance.
  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void;
  };
  expressApp.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));

  app.use(helmet());
  app.use(cookieParser());

  // Global RFC 7807 error envelope per docs/13-api-design.md#формат-ответов.
  app.useGlobalFilters(new ProblemDetailsFilter());

  app.enableCors({
    origin: config.get('WEB_URL', { infer: true }),
    credentials: true,
  });

  // Phase 1: global prefix /api/v1 per docs/13-api-design.md.
  app.setGlobalPrefix('api/v1', {
    // Health endpoints stay un-prefixed so external uptime checks (Caddy,
    // Uptime Kuma) hit a stable URL.
    exclude: ['health', 'ready'],
  });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
