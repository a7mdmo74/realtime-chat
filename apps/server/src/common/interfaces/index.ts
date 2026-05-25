/**
 * src/common/interfaces/index.ts
 *
 * Shared interfaces that are used across multiple modules.
 * Centralized here to avoid circular imports and duplication.
 */

import { Role } from '@prisma/client';

/**
 * Shape of the JWT payload embedded in access tokens.
 * Keep this MINIMAL — it's encoded in every request header.
 */
export interface JwtPayload {
  sub: string;         // User ID (subject)
  email: string;
  username: string;
  role: Role;
  iat?: number;        // Issued at (added by JWT library)
  exp?: number;        // Expiration
}

/**
 * Refresh token JWT payload — includes a family ID for rotation detection.
 */
export interface RefreshTokenPayload {
  sub: string;
  tokenId: string;     // Maps to RefreshToken.id in DB for revocation
}

/**
 * The authenticated user attached to Request by Passport JWT strategy.
 * This is what `@CurrentUser()` returns.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  role: Role;
}

/**
 * Standard API response envelope.
 * All HTTP responses go through the ResponseInterceptor to match this shape.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
  timestamp: string;
  path: string;
}

/**
 * Pagination meta included in list responses.
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Standard cursor-based pagination query parameters.
 * Cursor pagination is better than offset for real-time feeds (chat, social).
 */
export interface CursorPaginationQuery {
  cursor?: string;
  limit?: number;
  direction?: 'forward' | 'backward';
}

/**
 * WebSocket event envelope — all WS events follow this shape.
 */
export interface WsEvent<T = unknown> {
  event: string;
  data: T;
  roomId?: string;
  timestamp: string;
}

/**
 * Authenticated WebSocket client data stored on socket.data
 */
export interface SocketData {
  userId: string;
  username: string;
  role: Role;
}
