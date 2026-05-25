/**
 * src/common/decorators/current-user.decorator.ts
 *
 * WHY A CUSTOM DECORATOR:
 * Without this, every controller method would write:
 *   @Req() req: Request
 *   const user = req.user as AuthenticatedUser;
 *
 * That's verbose, untyped, and leaks HTTP concerns into business logic.
 * The decorator encapsulates the extraction in one place.
 *
 * USAGE:
 *   @Get('profile')
 *   getProfile(@CurrentUser() user: AuthenticatedUser) { ... }
 *
 *   @Get('id-only')
 *   getMe(@CurrentUser('id') userId: string) { ... }
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces';

export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    return field ? user?.[field] : user;
  },
);
