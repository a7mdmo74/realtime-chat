/**
 * src/modules/auth/guards/jwt-auth.guard.ts
 *
 * WHY EXTEND AUTHGUARD:
 * The base AuthGuard handles the Passport flow (calling strategy.validate()).
 * We extend it to add custom error messages and to handle the
 * IS_PUBLIC_KEY metadata that allows opt-out of authentication.
 *
 * DESIGN DECISION: We use opt-in authentication (every route is protected
 * by default when JwtAuthGuard is applied globally). Public routes
 * use the @Public() decorator to bypass the guard.
 */

import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-access') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Check if the route or controller is marked @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = any>(
    err: Error | null,
    user: TUser | false,
    info: { message?: string },
  ): TUser {
    if (err || !user) {
      const message = info?.message || 'Authentication required';

      // Differentiate between expired and invalid tokens for client UX
      if (info?.message === 'jwt expired') {
        throw new UnauthorizedException('Token has expired — please refresh');
      }
      if (info?.message?.includes('invalid')) {
        throw new UnauthorizedException('Invalid authentication token');
      }

      throw new UnauthorizedException(message);
    }

    return user;
  }
}

/**
 * Decorator to mark routes/controllers as publicly accessible.
 *
 * USAGE:
 *   @Public()
 *   @Post('login')
 *   login() { ... }
 */
import { SetMetadata } from '@nestjs/common';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
