/**
 * src/modules/chat/gateways/ws-jwt.guard.ts
 *
 * WHY A SEPARATE WS AUTH GUARD:
 * HTTP guards use `context.switchToHttp()`. WebSocket guards use
 * `context.switchToWs()`. The JWT extraction and validation logic is
 * the same, but the transport layer is different.
 *
 * TWO-PHASE WS AUTHENTICATION STRATEGY:
 * Phase 1 — Connection: The client sends the JWT in the handshake
 *   `auth.token` field. We validate it here and attach the user to
 *   `socket.data`. If invalid, the connection is rejected before
 *   any events are processed.
 *
 * Phase 2 — Per-event: Guards on individual @SubscribeMessage handlers
 *   check `socket.data.userId` — no token re-validation needed per event.
 *
 * This is important because:
 *   1. Socket connections are long-lived — we validate ONCE at connect
 *   2. Re-reading the JWT header per message would be expensive
 *   3. socket.data persists for the connection lifetime
 */

import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { JwtPayload, SocketData } from '../../../common/interfaces';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();

    try {
      // Token is passed in socket handshake auth object:
      // io({ auth: { token: 'Bearer eyJ...' } })
      const rawToken =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization;

      if (!rawToken) {
        throw new WsException('No authentication token provided');
      }

      const token = rawToken.replace(/^Bearer\s+/i, '');

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });

      // Attach decoded user to socket.data — accessible in all handlers
      const socketData: SocketData = {
        userId: payload.sub,
        username: payload.username,
        role: payload.role,
      };

      client.data = socketData;

      return true;
    } catch (error) {
      this.logger.warn(
        `WS auth failed for socket ${client.id}: ${(error as Error).message}`,
      );
      throw new WsException('Authentication failed');
    }
  }
}
