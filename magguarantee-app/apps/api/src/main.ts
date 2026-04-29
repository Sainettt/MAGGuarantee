import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  app.use(helmet());

  const config = app.get(ConfigService<Env, true>);

  app.enableCors({
    origin: config.get('WEB_URL', { infer: true }),
    credentials: true,
  });

  // Phase 0: no global prefix. From Phase 2+ this becomes '/api/v1'.
  app.setGlobalPrefix('');

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
