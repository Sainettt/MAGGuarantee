import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  // Trust the first proxy hop (Caddy / nginx in prod) — required for
  // ThrottlerGuard to read the real IP from X-Forwarded-For.
  // express-style: `app.set('trust proxy', 1)` via the underlying instance.
  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void;
  };
  expressApp.set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());

  const config = app.get(ConfigService<Env, true>);

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
