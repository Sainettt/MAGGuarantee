// Download access log for the Maksim authorization-confirmation screenshot
// (2026-08-14 logging audit, item 22): one structured INFO line per download
// with nrZgl + attachment id + category + requester. Not an audit row.

import 'reflect-metadata';

import { Logger, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { ClaimAttachmentsController } from './claim-attachments.controller';
import type { ClaimAttachmentsService } from './claim-attachments.service';
import { makeAuthUser } from '../../common/testing/make-auth-user';

const pracownik: AuthUser = makeAuthUser('pracownik', {
  sub: 'u-prac',
  login: 'prac',
  email: 'prac@magtrans.eu',
  name: 'Pracownik',
  mustChangePassword: false,
});

function controllerWith(download: jest.Mock): ClaimAttachmentsController {
  return new ClaimAttachmentsController({
    download,
  } as unknown as ClaimAttachmentsService);
}

describe('ClaimAttachmentsController.download — access log', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs nrZgl + attachment id + category + requester and streams the file', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const pipe = jest.fn();
    const download = jest.fn(async () => ({
      object: { body: { pipe }, contentType: 'image/png', contentLength: 3 },
      mimeType: 'image/png',
      category: 'AUTORYZACJA_MAKSIMA',
    }));
    const res = { setHeader: jest.fn() } as unknown as Response;

    await controllerWith(download).download(
      pracownik,
      'GWA/001/05/26',
      'att-1',
      { ip: '203.0.113.11' } as Request,
      res,
    );

    expect(download).toHaveBeenCalledWith('GWA/001/05/26', 'att-1');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toEqual({
      msg: 'attachment downloaded',
      entity: 'Claim',
      nrZgl: 'GWA/001/05/26',
      attachmentId: 'att-1',
      category: 'AUTORYZACJA_MAKSIMA',
      userId: 'u-prac',
      role: 'pracownik',
      ip: '203.0.113.11',
    });
    expect(pipe).toHaveBeenCalledWith(res);
  });

  it('does not log when the download is refused', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const download = jest.fn(async () => {
      throw new NotFoundException('Załącznik nie znaleziony');
    });
    const res = { setHeader: jest.fn() } as unknown as Response;

    await expect(
      controllerWith(download).download(
        pracownik,
        'GWA/001/05/26',
        'att-x',
        {} as Request,
        res,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(log).not.toHaveBeenCalled();
  });
});
