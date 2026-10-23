import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import {
  UuidSchema,
  type GpsPositionListResponse,
  type GpsPositionResponse,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUser,
} from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { GpsService } from './gps.service';

/**
 * GPS endpoints per docs/13-api-design.md#external-integrations and
 * docs/16-jobs-and-integrations.md#gps-tracker-статус-ожидает-доступа-к-api.
 *
 * Gates (docs/25 §3 B2; global `PermissionsGuard`; mirrored per route in the
 * generated fixture `common/authz/__fixtures__/endpoint-permissions.snapshot.json`):
 *  - `gps.read` (positions, trips): admin / opiekun / planista / dyspozytor /
 *    przewoznik.
 *  - `gps.refresh` (refresh): admin only.
 *  - pracownik / eksport / weryfikator hold neither → 403. pracownik is a
 *    narrow claims-only role per docs/03-roles.md#pracownik (no fleet view);
 *    eksport / weryfikator have NO GPS visibility per the wave brief.
 *
 * The /trips endpoint is documented but Phase 11+ — we expose it as 501.
 */
@Controller('integrations/gps')
export class GpsController {
  constructor(private readonly gps: GpsService) {}

  @Get('positions')
  @RequirePermission('gps.read')
  async listPositions(
    @CurrentUser() user: AuthUser,
  ): Promise<GpsPositionListResponse> {
    return this.gps.getMany(user);
  }

  @Get('positions/:vehicleId')
  @RequirePermission('gps.read')
  async getPosition(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', new ZodValidationPipe(UuidSchema)) vehicleId: string,
  ): Promise<GpsPositionResponse> {
    return this.gps.getOne(user, vehicleId);
  }

  @Get('trips/:vehicleId')
  @RequirePermission('gps.read')
  trips(): never {
    // Phase 11+ feature per docs/16-jobs-and-integrations.md#todo-после-получения-api-access.
    // Surfacing an explicit 501 is deliberate — clients see the endpoint exists
    // but isn't wired, instead of a vague 404 that looks like a routing bug.
    throw new HttpException(
      {
        statusCode: HttpStatus.NOT_IMPLEMENTED,
        message: 'GPS trips not yet implemented (Phase 11+)',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Admin-only (`gps.refresh`) debug endpoint: forces the configured provider
   * to refresh the Redis cache for the entire fleet. Useful during Phase 2 (no
   * BullMQ worker yet) so devs / QA can populate the cache on demand.
   *
   * Once the BullMQ worker is wired (Phase 9), this endpoint stays — it's
   * still handy for "rerun after vendor outage" scenarios.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('gps.refresh')
  async refresh(): Promise<{ written: number; source: 'mock' | 'vendor' }> {
    return this.gps.populateFromProvider({ kind: 'all' });
  }
}
