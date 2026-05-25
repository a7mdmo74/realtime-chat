/**
 * src/common/decorators/roles.decorator.ts
 *
 * WHY METADATA-BASED ROLES:
 * Role checks happen in the RolesGuard, not controllers.
 * The decorator attaches metadata; the guard reads it.
 * This separates authorization logic from business logic cleanly.
 *
 * USAGE:
 *   @Roles(Role.ADMIN, Role.MODERATOR)
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Delete('users/:id')
 *   deleteUser(...) { ... }
 */

import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
