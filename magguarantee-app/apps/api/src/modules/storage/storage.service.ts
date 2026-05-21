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
 */
@Injectable()
export class StorageService {
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
      throw new InternalServerErrorException(
        `Nie udało się zapisać pliku w magazynie (${describeError(err)})`,
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
      throw new InternalServerErrorException(
        `Nie udało się odczytać pliku z magazynu (${describeError(err)})`,
      );
    }
    if (!res.Body || !(res.Body instanceof Readable)) {
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
      throw new InternalServerErrorException(
        `Nie udało się usunąć pliku z magazynu (${describeError(err)})`,
      );
    }
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

/** Extracts a short, log-safe description from an unknown SDK error. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.name;
  return 'unknown';
}
