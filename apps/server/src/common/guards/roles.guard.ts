/**
 * src/common/guards/roles.guard.ts
 *
 * WHY A SEPARATE ROLES GUARD:
 * JwtAuthGuard handles authentication (who are you?).
 * RolesGuard handles authorization (what can you do?).
 * Separating these follows Single Responsibility Principle —
 * each guard has exactly one job.
 *
 * DESIGN: If no @Roles() decorator is present, the guard passes.
 * This means unauthenticated routes work, and role-restricted
 * routes are opt-in, not opt-out.
 */

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../interfaces';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator = no role restriction
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) return false;

    return requiredRoles.includes(user.role);
  }
}
