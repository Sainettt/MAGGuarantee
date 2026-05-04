import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type {
  CreateTrailerTypeDto,
  TrailerTypeDto,
  TrailerTypeFilters,
  UpdateTrailerTypeDto,
} from '@magguarantee/shared';

import {
  isPrismaUniqueViolation,
  uniqueViolationToConflict,
} from '../../common/errors/prisma-error';
import {
  TrailerTypesRepository,
  type TrailerTypeRow,
} from './trailer-types.repository';

@Injectable()
export class TrailerTypesService {
  constructor(private readonly repo: TrailerTypesRepository) {}

  async list(filters: TrailerTypeFilters): Promise<TrailerTypeDto[]> {
    const rows = await this.repo.list(filters);
    return rows.map((r) => this.toDto(r));
  }

  async create(dto: CreateTrailerTypeDto): Promise<TrailerTypeDto> {
    try {
      const row = await this.repo.create({
        name: dto.name,
        shortCode: dto.shortCode ?? null,
        description: dto.description ?? null,
        active: dto.active,
      });
      return this.toDto(row);
    } catch (err) {
      throw uniqueViolationToConflict(
        err,
        'Typ naczepy o tej nazwie już istnieje',
      );
    }
  }

  async update(
    id: string,
    dto: UpdateTrailerTypeDto,
  ): Promise<TrailerTypeDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Typ naczepy nie znaleziony');
    try {
      const row = await this.repo.update(id, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.shortCode !== undefined ? { shortCode: dto.shortCode } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      });
      return this.toDto(row);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw uniqueViolationToConflict(
          err,
          'Typ naczepy o tej nazwie już istnieje',
        );
      }
      throw err;
    }
  }

  async deactivate(id: string): Promise<TrailerTypeDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Typ naczepy nie znaleziony');
    if (!existing.active) {
      throw new ConflictException('Typ naczepy jest już nieaktywny');
    }
    const row = await this.repo.update(id, { active: false });
    return this.toDto(row);
  }

  // ── DTO mapping ──────────────────────────────────────────

  toDto(row: TrailerTypeRow): TrailerTypeDto {
    return {
      id: row.id,
      name: row.name,
      shortCode: row.shortCode,
      description: row.description,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
