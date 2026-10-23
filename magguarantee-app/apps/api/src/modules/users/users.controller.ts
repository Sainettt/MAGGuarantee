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
} from '@nestjs/common';

import {
  CreateUserRequestSchema,
  ResetPasswordModeSchema,
  UpdateUserSchema,
  UserFiltersSchema,
  UuidSchema,
  type CreateUserDto,
  type ResetPasswordModeDto,
  type UpdateUserDto,
  type UserDtoFull,
  type UserFilters,
  type UserWithTemporaryPasswordDto,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { UsersService } from './users.service';

/**
 * Admin user CRUD per docs/13-api-design.md#users-admin-only.
 *
 * The whole controller requires `users.manage` (class-level
 * `@RequirePermission`, docs/25 §3 B2; global `PermissionsGuard`), held only
 * by `admin`. Mutating endpoints carry @Audit so each change lands in
 * `audit_log`.
 *
 * Note: przewoznik users are NOT created here — see CarriersController which
 * provisions a user + carrier row in the same transaction.
 */
@Controller('users')
@RequirePermission('users.manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(UserFiltersSchema)) query: UserFilters,
  ): Promise<{ items: UserDtoFull[]; nextCursor: string | null }> {
    return this.users.list(query);
  }

  @Get(':id')
  async getById(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<UserDtoFull> {
    return this.users.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    action: 'createUser',
    targetType: 'User',
    targetKey: (_req, result) => (result as { login?: string }).login,
  })
  async create(
    // `CreateUserRequestSchema` = the shape + the `(role, lider)` pair; a bad
    // pair is 422 `USER_LIDER_REQUIRES_LIDER_ROLE` (docs/28), not a 400.
    @Body(new ZodValidationPipe(CreateUserRequestSchema)) dto: CreateUserDto,
  ): Promise<UserWithTemporaryPasswordDto> {
    return this.users.create(dto);
  }

  @Patch(':id')
  @Audit({
    action: 'updateUser',
    targetType: 'User',
    targetKey: (req) => req.params?.id,
  })
  async update(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) dto: UpdateUserDto,
  ): Promise<UserDtoFull> {
    return this.users.update(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'deactivateUser',
    targetType: 'User',
    targetKey: (req) => req.params?.id,
  })
  async deactivate(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<UserDtoFull> {
    return this.users.deactivate(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'reactivateUser',
    targetType: 'User',
    targetKey: (req) => req.params?.id,
  })
  async reactivate(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<UserDtoFull> {
    return this.users.reactivate(id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'resetUserPassword',
    targetType: 'User',
    targetKey: (req) => req.params?.id,
    // Result body carries `temporaryPassword` — even with the field-name
    // scrubber that's still potentially noisy. Drop it from the audit row.
    omitResultBody: true,
  })
  async resetPassword(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(ResetPasswordModeSchema))
    mode: ResetPasswordModeDto,
  ): Promise<UserWithTemporaryPasswordDto> {
    return this.users.resetPassword(id, mode);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'deleteUser',
    targetType: 'User',
    targetKey: (req) => req.params?.id,
  })
  async delete(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<void> {
    await this.users.softDelete(id);
  }
}
