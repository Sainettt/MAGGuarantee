import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';

/**
 * Result of a `getObject` call — the raw byte stream plus the metadata the
 * download proxy needs to set response headers.
 */
export interface StorageObject {
  body: Readable;
  contentType: string | null;
  contentLength: number | null;
}

/** Which storage call failed — part of every failure log line. */
type StorageOperation = 'put' | 'get' | 'delete';

/**
 * Generic S3-compatible object storage facade (MinIO in dev, per
 * docs/16-jobs-and-integrations.md#файловое-хранилище--s3).
 *
 * Deliberately key-prefix agnostic: this is the project's first real S3
 * consumer, but it is NOT vehicle-specific. Callers own their own key
 * scheme (e.g. `vehicles/<id>/<category>/<fileId>.<ext>`). A future
 * claims module reuses the same `put`/`getObject`/`delete` surface for auth
 * screenshots — we do NOT bake the docs/16 `uploadAuthScreenshot` signature
 * in here.
 *
 * Failures (2026-09-14 logging audit, item 10): every transport failure is
 * logged here with the full SDK error detail BEFORE it is rethrown as a 500 —
 * the client only ever sees the error class name, and callers typically run a
 * compensating rollback that would otherwise be the only visible trace. The
 * original SDK error rides along as the exception's `cause`.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.s3 = new S3Client({
      region: config.get('S3_REGION', { infer: true }),
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
      // MinIO (and most non-AWS S3 implementations) need path-style URLs:
      // `http://host/bucket/key` rather than `http://bucket.host/key`.
      forcePathStyle: true,
    });
  }

  /**
   * Uploads a buffer under `key`. Overwrites any existing object at that key.
   * Throws 500 on transport failure — callers are expected to roll back.
   */
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.length,
        }),
      );
    } catch (err) {
      throw this._failure(
        'put',
        key,
        err,
        'Nie udało się zapisać pliku w magazynie',
      );
    }
  }

  /**
   * Streams an object back from storage. The caller proxies the stream to the
   * HTTP response — bytes never get fully buffered in memory.
   *
   * Throws 404 if the key does not exist, 500 on any other transport failure.
   */
  async getObject(key: string): Promise<StorageObject> {
    let res;
    try {
      res = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      if (isNotFound(err)) {
        throw new NotFoundException('Plik nie istnieje w magazynie');
      }
      throw this._failure(
        'get',
        key,
        err,
        'Nie udało się odczytać pliku z magazynu',
      );
    }
    if (!res.Body || !(res.Body instanceof Readable)) {
      this.logger.error({
        msg: 'storage get returned an unexpected body type',
        operation: 'get',
        bucket: this.bucket,
        key,
        bodyType: res.Body === undefined ? 'undefined' : typeof res.Body,
      });
      throw new InternalServerErrorException(
        'Magazyn zwrócił nieoczekiwany format odpowiedzi',
      );
    }
    return {
      body: res.Body,
      contentType: res.ContentType ?? null,
      contentLength: typeof res.ContentLength === 'number'
        ? res.ContentLength
        : null,
    };
  }

  /**
   * Deletes an object. S3 delete is idempotent — deleting a missing key is a
   * no-op (no error). Used to roll back partial uploads on a failed create.
   */
  async delete(key: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      throw this._failure(
        'delete',
        key,
        err,
        'Nie udało się usunąć pliku z magazynu',
      );
    }
  }

  // ── internals ──────────────────────────────────────────

  /**
   * Log the SDK failure in full and build the 500 to rethrow. Object keys are
   * `<entity>/<uuid>/<category>/<uuid>.<ext>` — ids only, safe to log.
   */
  private _failure(
    operation: StorageOperation,
    key: string,
    err: unknown,
    message: string,
  ): InternalServerErrorException {
    this.logger.error({
      msg: `storage ${operation} failed`,
      operation,
      bucket: this.bucket,
      key,
      ...describeSdkError(err),
    });
    return new InternalServerErrorException(
      `${message} (${describeError(err)})`,
      { cause: err },
    );
  }
}

/** True when the SDK error indicates the object/bucket was not found. */
function isNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const name = (err as { name?: unknown }).name;
  const code = (err as { Code?: unknown }).Code;
  const status = (err as { $metadata?: { httpStatusCode?: unknown } })
    .$metadata?.httpStatusCode;
  return (
    name === 'NoSuchKey' ||
    name === 'NotFound' ||
    code === 'NoSuchKey' ||
    status === 404
  );
}

/**
 * Short, client-safe description of an unknown SDK error (the class name only)
 * for the exception message. The full error travels as `cause` and is logged
 * via {@link describeSdkError}.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.name;
  return 'unknown';
}

/**
 * Log fields for an AWS SDK v3 service/transport error: class name, message,
 * the S3 error `Code`, HTTP status and the request ids S3/MinIO support needs
 * to trace the call. Credentials never appear on these errors.
 */
export function describeSdkError(err: unknown): Record<string, unknown> {
  if (typeof err !== 'object' || err === null) {
    return { error: String(err) };
  }
  const e = err as {
    name?: unknown;
    message?: unknown;
    Code?: unknown;
    code?: unknown;
    $fault?: unknown;
    $metadata?: {
      httpStatusCode?: unknown;
      requestId?: unknown;
      extendedRequestId?: unknown;
      attempts?: unknown;
    };
    stack?: unknown;
  };
  return {
    error: e.name,
    errorMessage: e.message,
    s3Code: e.Code ?? e.code,
    fault: e.$fault,
    httpStatusCode: e.$metadata?.httpStatusCode,
    requestId: e.$metadata?.requestId,
    extendedRequestId: e.$metadata?.extendedRequestId,
    attempts: e.$metadata?.attempts,
    stack: e.stack,
  };
}
