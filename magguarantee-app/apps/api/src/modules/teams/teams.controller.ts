import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  CreateTeamSchema,
  TeamFiltersSchema,
  UpdateTeamSchema,
  UuidSchema,
  type CreateTeamDto,
  type TeamDto,
  type TeamFilters,
  type UpdateTeamDto,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TeamsService } from './teams.service';

/**
 * Dispatch-team admin CRUD per docs/13-api-design.md#teams-admin-only.
 *
 * Every endpoint is `admin`-only (Phase 11). A `Team` is the dispatch unit a
 * vehicle is assigned to — it replaces the legacy single `Vehicle.dispatcherId`.
 * The team catalog is an explicit replacement for the external "raport DAF"
 * Excel.
 *
 * Hard-delete is GUARDED (409 if the team still references users/vehicles) —
 * deactivate via `/teams/:id/deactivate` to take a referenced team out of
 * service.
 */
@Controller('teams')
@UseGuards(RolesGuard)
@Roles('admin')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(TeamFiltersSchema)) query: TeamFilters,
  ): Promise<TeamDto[]> {
    return this.teams.list(query);
  }

  @Get(':id')
  async getById(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<TeamDto> {
    return this.teams.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    action: 'createTeam',
    targetType: 'Team',
    targetKey: (_req, result) => (result as { id?: string }).id,
  })
  async create(
    @Body(new ZodValidationPipe(CreateTeamSchema)) dto: CreateTeamDto,
  ): Promise<TeamDto> {
    return this.teams.create(dto);
  }

  @Patch(':id')
  @Audit({
    action: 'updateTeam',
    targetType: 'Team',
    targetKey: (req) => req.params?.id,
  })
  async update(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateTeamSchema)) dto: UpdateTeamDto,
  ): Promise<TeamDto> {
    return this.teams.update(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'deactivateTeam',
    targetType: 'Team',
    targetKey: (req) => req.params?.id,
  })
  async deactivate(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<TeamDto> {
    return this.teams.deactivate(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'reactivateTeam',
    targetType: 'Team',
    targetKey: (req) => req.params?.id,
  })
  async reactivate(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<TeamDto> {
    return this.teams.reactivate(id);
  }

  /**
   * Hard-delete (admin-only). GUARDED: 409 when the team still references
   * dispatchers or vehicles — deactivate instead. No `reason` body (Team is a
   * small admin catalog, unlike Vehicle/Carrier hard-delete which require one).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'deleteTeam',
    targetType: 'Team',
    targetKey: (req) => req.params?.id,
  })
  async delete(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<void> {
    await this.teams.hardDelete(id);
  }
}
