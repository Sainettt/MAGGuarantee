// Download access log for trailer documents (2026-08-14 logging audit,
// item 22). Every download writes one structured INFO line with ids + category
// + requester — not an audit row, and never the original filename.

import 'reflect-metadata';

import { Logger, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { TrailersController } from './trailers.controller';
import type { TrailersService } from './trailers.service';
import { makeAuthUser } from '../../common/testing/make-auth-user';

const opiekun: AuthUser = makeAuthUser('opiekun', {
  sub: 'u-op',
  login: 'opiekun1',
  email: 'opiekun1@magtrans.eu',
  name: 'Opiekun One',
  mustChangePassword: false,
});

function controllerWith(downloadAttachment: jest.Mock): TrailersController {
  return new TrailersController({
    downloadAttachment,
  } as unknown as TrailersService);
}

describe('TrailersController.downloadAttachment — access log', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs ids + category + requester (no filename) and streams the file', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const pipe = jest.fn();
    const download = jest.fn(async () => ({
      object: { body: { pipe }, contentType: 'application/pdf', contentLength: 3 },
      fileName: 'certyfikat XL Kowalski.pdf',
      mimeType: 'application/pdf',
      category: 'cert_xl',
    }));
    const res = { setHeader: jest.fn() } as unknown as Response;

    await controllerWith(download).downloadAttachment(
      opiekun,
      'trl-1',
      'att-1',
      { ip: '203.0.113.10' } as Request,
      res,
    );

    expect(download).toHaveBeenCalledWith('trl-1', 'att-1');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toEqual({
      msg: 'attachment downloaded',
      entity: 'Trailer',
      entityId: 'trl-1',
      attachmentId: 'att-1',
      category: 'cert_xl',
      userId: 'u-op',
      role: 'opiekun',
      ip: '203.0.113.10',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Kowalski');
    expect(pipe).toHaveBeenCalledWith(res);
  });

  it('logs ip: null when the request carries no address', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const download = jest.fn(async () => ({
      object: { body: { pipe: jest.fn() }, contentType: null, contentLength: null },
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
      category: 'cert_xl',
    }));
    const res = { setHeader: jest.fn() } as unknown as Response;

    await controllerWith(download).downloadAttachment(
      opiekun,
      'trl-1',
      'att-1',
      {} as Request,
      res,
    );

    expect(log.mock.calls[0]![0]).toMatchObject({ ip: null });
  });

  it('does not log when the download is refused', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const download = jest.fn(async () => {
      throw new NotFoundException('Załącznik nie znaleziony');
    });
    const res = { setHeader: jest.fn() } as unknown as Response;

    await expect(
      controllerWith(download).downloadAttachment(
        opiekun,
        'trl-1',
        'att-x',
        {} as Request,
        res,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(log).not.toHaveBeenCalled();
  });
});
