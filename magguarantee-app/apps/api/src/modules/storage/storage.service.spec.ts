// Storage failures used to be rethrown as a 500 carrying only the SDK error's
// class name — no log line, no cause, no request id to hand to S3/MinIO
// support (2026-09-14 logging audit, item 10).

import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { describeSdkError, StorageService } from './storage.service';

const CONFIG: Record<string, string> = {
  S3_BUCKET: 'magguarantee',
  S3_REGION: 'us-east-1',
  S3_ENDPOINT: 'http://minio:9000',
  S3_ACCESS_KEY: 'AKIA-TEST-ACCESS',
  S3_SECRET_KEY: 'super-secret-key',
};

const KEY = 'vehicles/3f2c1a9e/registration/9b1d.pdf';

function makeService(send: jest.Mock): StorageService {
  const svc = new StorageService({
    get: (k: string) => CONFIG[k],
  } as unknown as ConfigService<Env, true>);
  (svc as unknown as { s3: { send: jest.Mock } }).s3 = { send };
  return svc;
}

function sdkError(name: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`${name}: The specified bucket does not exist`), {
    name,
    $fault: 'client',
    $metadata: {
      httpStatusCode: 404,
      requestId: '17F2A3B4C5D6E7F8',
      extendedRequestId: 'dd9025bab4ad464b049177c95eb6ebf374d3b3fd1af9251148b658df7ac2e3e8',
      attempts: 1,
    },
    Code: name,
    ...extra,
  });
}

describe('StorageService', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it.each([
    ['put', (s: StorageService) => s.put(KEY, Buffer.from('x'), 'application/pdf'), PutObjectCommand],
    ['get', (s: StorageService) => s.getObject(KEY), GetObjectCommand],
    ['delete', (s: StorageService) => s.delete(KEY), DeleteObjectCommand],
  ] as const)(
    '%s: logs the full SDK error, rethrows a 500 with the SDK error as cause',
    async (operation, call, command) => {
      const err = sdkError('NoSuchBucket', { $metadata: { httpStatusCode: 500, requestId: 'REQ-1', attempts: 3 } });
      const send = jest.fn().mockRejectedValue(err);
      const svc = makeService(send);

      const thrown = await call(svc).catch((e: unknown) => e);

      expect(send.mock.calls[0]?.[0]).toBeInstanceOf(command);
      expect(thrown).toBeInstanceOf(InternalServerErrorException);
      const ex = thrown as InternalServerErrorException;
      expect(ex.cause).toBe(err);
      // The client-facing message names the error class only.
      expect(ex.message).toContain('(NoSuchBucket)');
      expect(ex.message).not.toContain('does not exist');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: `storage ${operation} failed`,
          operation,
          bucket: 'magguarantee',
          key: KEY,
          error: 'NoSuchBucket',
          errorMessage: 'NoSuchBucket: The specified bucket does not exist',
          s3Code: 'NoSuchBucket',
          httpStatusCode: 500,
          requestId: 'REQ-1',
          attempts: 3,
        }),
      );
      const logged = JSON.stringify(errorSpy.mock.calls);
      expect(logged).not.toContain('super-secret-key');
      expect(logged).not.toContain('AKIA-TEST-ACCESS');
    },
  );

  it('get: a missing key is a 404 and not logged as a failure', async () => {
    const send = jest.fn().mockRejectedValue(sdkError('NoSuchKey'));

    await expect(makeService(send).getObject(KEY)).rejects.toBeInstanceOf(NotFoundException);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('get: an unexpected body type is logged and surfaces as 500', async () => {
    const send = jest.fn().mockResolvedValue({ Body: 'not-a-stream' });

    await expect(makeService(send).getObject(KEY)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'get', key: KEY, bodyType: 'string' }),
    );
  });

  it('get: returns the stream and metadata on success', async () => {
    const body = Readable.from(['abc']);
    const send = jest.fn().mockResolvedValue({ Body: body, ContentType: 'application/pdf', ContentLength: 3 });

    await expect(makeService(send).getObject(KEY)).resolves.toEqual({
      body,
      contentType: 'application/pdf',
      contentLength: 3,
    });
  });

  describe('describeSdkError', () => {
    it('handles a network error without SDK metadata', () => {
      const err = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:9000'), { code: 'ECONNREFUSED' });
      expect(describeSdkError(err)).toMatchObject({
        error: 'Error',
        errorMessage: 'connect ECONNREFUSED 10.0.0.5:9000',
        s3Code: 'ECONNREFUSED',
        httpStatusCode: undefined,
        requestId: undefined,
      });
    });

    it('handles non-object throwables', () => {
      expect(describeSdkError('boom')).toEqual({ error: 'boom' });
      expect(describeSdkError(null)).toEqual({ error: 'null' });
    });
  });
});
