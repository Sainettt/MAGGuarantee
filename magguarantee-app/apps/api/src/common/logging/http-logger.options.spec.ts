// End-to-end check of the pino-http options through a real Nest + Express
// stack: the request binding is serialized when the request arrives (before
// routing), the completion line after — both must be free of query strings and
// secret values, and the completion line must carry the route template.

import 'reflect-metadata';
import { Writable } from 'node:stream';

import {
  Controller,
  Get,
  INestApplication,
  Logger,
  Module,
  Param,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerModule, Logger as PinoNestLogger } from 'nestjs-pino';
import pino from 'pino';
import request from 'supertest';

import {
  buildHttpLoggerOptions,
  LOG_CENSOR,
  LOG_REDACT_PATHS,
  serializeRequest,
} from './http-logger.options';

const NIP = '1234567890';
const ACCOUNT = '12345678901234567890123456';

function captureStream(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      chunks.push(chunk.toString('utf8'));
      cb();
    },
  });
  return {
    stream,
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

@Controller('things')
class ThingsController {
  private readonly logger = new Logger('Things');

  @Get(':id')
  get(@Param('id') id: string): { id: string } {
    this.logger.log({ msg: 'in handler', payload: { body: { password: 'p', code: '123456' } } });
    return { id };
  }
}

describe('buildHttpLoggerOptions', () => {
  it('does not configure pino-pretty in production', () => {
    expect(buildHttpLoggerOptions({ NODE_ENV: 'production' }).transport).toBeUndefined();
    expect(buildHttpLoggerOptions({ NODE_ENV: 'development' }).transport).toEqual({
      target: 'pino-pretty',
    });
  });

  describe('serializeRequest', () => {
    it('logs method + path without query, IP and allow-listed headers only', () => {
      const out = serializeRequest({
        id: 7,
        method: 'GET',
        url: `/api/v1/integrations/whitelist?nip=${NIP}&account=${ACCOUNT}`,
        headers: {
          'user-agent': 'jest',
          authorization: 'Bearer abc',
          cookie: 'access_token=abc',
          referer: `https://app/carriers?nip=${NIP}`,
        },
        raw: { ip: '10.0.0.9' },
      });

      expect(out).toEqual({
        id: 7,
        method: 'GET',
        url: '/api/v1/integrations/whitelist',
        ip: '10.0.0.9',
        headers: { 'user-agent': 'jest' },
      });
      expect(JSON.stringify(out)).not.toContain(NIP);
    });
  });

  describe('redaction', () => {
    it('redacts secret keys at the top level and two levels deep', () => {
      const { stream, lines } = captureStream();
      const logger = pino(
        { redact: { paths: [...LOG_REDACT_PATHS], censor: LOG_CENSOR } },
        stream,
      );

      logger.info({
        password: 'top',
        resetCode: '111111',
        code: 'P2002',
        job: { props: { code: '222222', temporaryPassword: 'tmp' } },
        err: { cause: { apiKey: 'k' } },
        ctx: { refreshToken: 'r' },
      });

      const [line] = lines();
      expect(line).toMatchObject({
        password: LOG_CENSOR,
        resetCode: LOG_CENSOR,
        // Top-level `code` is an error code and stays readable.
        code: 'P2002',
        job: { props: { code: LOG_CENSOR, temporaryPassword: LOG_CENSOR } },
        err: { cause: { apiKey: LOG_CENSOR } },
        ctx: { refreshToken: LOG_CENSOR },
      });
    });
  });

  describe('through Nest + pino-http', () => {
    let app: INestApplication;
    let lines: () => Record<string, unknown>[];

    beforeAll(async () => {
      const capture = captureStream();
      lines = capture.lines;

      @Module({
        imports: [
          LoggerModule.forRoot({
            pinoHttp: [buildHttpLoggerOptions({ NODE_ENV: 'production' }), capture.stream],
          }),
        ],
        controllers: [ThingsController],
      })
      class TestModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [TestModule],
      }).compile();
      app = moduleRef.createNestApplication({ bufferLogs: true });
      app.useLogger(app.get(PinoNestLogger));
      app.setGlobalPrefix('api/v1');
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('never logs the query string; the completion line carries the route template', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/things/abc?nip=${NIP}&account=${ACCOUNT}`)
        .set('Authorization', 'Bearer secret-jwt')
        .expect(200);

      const all = lines();
      const raw = JSON.stringify(all);
      expect(raw).not.toContain(NIP);
      expect(raw).not.toContain(ACCOUNT);
      expect(raw).not.toContain('secret-jwt');
      expect(raw).not.toContain('123456');

      const handlerLine = all.find((l) => l.msg === 'in handler');
      expect(handlerLine?.req).toMatchObject({
        method: 'GET',
        url: '/api/v1/things/abc',
      });

      const completed = all.find((l) => l.msg === 'request completed');
      expect(completed).toMatchObject({
        route: '/api/v1/things/:id',
        req: { method: 'GET', url: '/api/v1/things/abc' },
      });
      expect(completed?.req).not.toHaveProperty('query');
      expect(completed?.req).not.toHaveProperty('params');
    });

    it('does not log health probes', async () => {
      const before = lines().length;
      await request(app.getHttpServer()).get('/health?x=1').expect(404);
      const added = lines().slice(before);
      expect(added.find((l) => l.msg === 'request completed')).toBeUndefined();
    });
  });
});
