/**
 * src/modules/auth/strategies/jwt-access.strategy.ts
 *
 * WHY PASSPORT STRATEGIES:
 * Passport decouples authentication mechanism from route handlers.
 * The strategy handles token extraction and validation; guards
 * handle whether a route requires authentication.
 *
 * JWT ACCESS STRATEGY:
 * - Extracts token from Authorization: Bearer header
 * - Verifies signature using JWT_ACCESS_SECRET
 * - Checks expiration (done automatically by passport-jwt)
 * - Calls validate() to attach user to request
 *
 * SENIOR PRACTICE: validate() is minimal — just decodes the payload.
 * Heavy DB lookups in validate() happen on every request and are expensive.
 * Only fetch from DB if you need data not in the token.
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser, JwtPayload } from '../../../common/interfaces';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret'),
    });
  }

  /**
   * Called after signature and expiration are verified.
   * The return value is attached to request.user.
   */
  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid token payload');
    }

    return {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role,
    };
  }
}
