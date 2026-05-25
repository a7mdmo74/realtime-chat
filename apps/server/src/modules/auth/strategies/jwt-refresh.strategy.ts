/**
 * src/modules/auth/strategies/jwt-refresh.strategy.ts
 *
 * WHY A SEPARATE REFRESH STRATEGY:
 * Refresh tokens require additional validation beyond signature checking:
 *   1. The token must exist in the database (not revoked)
 *   2. The DB token hash must match the raw token
 *   3. The token must not be expired
 *
 * This strategy extracts the raw token from the request body
 * and passes it to the AuthService for DB-level validation.
 *
 * SECURITY: Refresh tokens implement token rotation — each use
 * issues a new token and revokes the old one. If a stolen token
 * is used after rotation, both parties fail, alerting to the breach.
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { RefreshTokenPayload } from '../../../common/interfaces';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret'),
      passReqToCallback: true, // We need the raw token for DB validation
    });
  }

  /**
   * payload: the decoded JWT payload
   * req: the raw request (we extract the raw token to validate against DB hash)
   */
  validate(
    req: Request,
    payload: RefreshTokenPayload,
  ): { userId: string; tokenId: string; rawToken: string } {
    const rawToken = req.body.refreshToken as string;

    return {
      userId: payload.sub,
      tokenId: payload.tokenId,
      rawToken,
    };
  }
}
