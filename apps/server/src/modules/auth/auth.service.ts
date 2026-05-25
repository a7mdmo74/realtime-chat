/**
 * src/modules/auth/auth.service.ts
 *
 * RESPONSIBILITIES:
 *   1. User registration with password hashing
 *   2. Login validation
 *   3. JWT access + refresh token generation
 *   4. Refresh token rotation (use once, get new pair)
 *   5. Logout (revoke refresh token)
 *   6. Token family tracking (detect stolen token reuse)
 *
 * SECURITY PRACTICES:
 *   - bcrypt with cost factor 12 (CPU-expensive, thwarts brute force)
 *   - Refresh tokens stored as bcrypt hashes in DB
 *   - Token rotation: each refresh issues new pair, revokes old
 *   - Timing-safe comparisons (bcrypt.compare prevents timing attacks)
 *   - Access tokens are stateless (no DB lookup per request)
 *   - Refresh tokens are stateful (DB revocation is possible)
 */

import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../database/prisma.service';
import { AppLogger } from '../../logger/logger.service';
import { JwtPayload, RefreshTokenPayload } from '../../common/interfaces';
import { RegisterDto, LoginDto, AuthResponseDto, TokenResponseDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private logger: AppLogger,
  ) {}

  // ─── Registration ──────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    // Check for existing users — separate checks for better error messages
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { username: dto.username }],
        deletedAt: null,
      },
    });

    if (existing) {
      if (existing.email === dto.email) {
        throw new ConflictException('Email is already registered');
      }
      throw new ConflictException('Username is already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        displayName: dto.displayName,
        passwordHash,
      },
    });

    this.logger.log(`User registered: ${user.id}`, AuthService.name);

    const tokens = await this.generateTokenPair(user);
    return this.buildAuthResponse(user, tokens);
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null, isActive: true },
    });

    // SECURITY: Same error for wrong email or wrong password
    // Don't reveal which one failed (user enumeration attack prevention)
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokenPair(user, { ipAddress, userAgent });
    this.logger.log(`User logged in: ${user.id}`, AuthService.name);

    return this.buildAuthResponse(user, tokens);
  }

  // ─── Token Refresh ─────────────────────────────────────────────────────────

  async refreshTokens(
    userId: string,
    tokenId: string,
    rawToken: string,
  ): Promise<TokenResponseDto> {
    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        id: tokenId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!storedToken) {
      // If the token doesn't exist OR is already revoked, it could mean
      // the token was stolen and already used. Revoke ALL tokens for this user.
      await this.revokeAllUserTokens(userId);
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    // Validate the raw token against the stored hash
    const isValid = await bcrypt.compare(rawToken, storedToken.token);
    if (!isValid) {
      await this.revokeAllUserTokens(userId);
      throw new UnauthorizedException('Refresh token mismatch — possible theft');
    }

    // Revoke the used token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });

    // Issue new token pair
    const tokens = await this.generateTokenPair(storedToken.user);
    this.logger.log(`Tokens rotated for user: ${userId}`, AuthService.name);

    return tokens;
  }

  // ─── Logout ────────────────────────────────────────────────────────────────

  async logout(userId: string, tokenId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id: tokenId, userId },
      data: { revokedAt: new Date() },
    });
    this.logger.log(`User logged out: ${userId}`, AuthService.name);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllUserTokens(userId);
    this.logger.log(`All sessions revoked for user: ${userId}`, AuthService.name);
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async generateTokenPair(
    user: User,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<TokenResponseDto> {
    const tokenId = uuidv4();

    // Access token — short-lived, stateless
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    };

    // Refresh token payload — references the DB record
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      tokenId,
    };

    const accessExpiration = this.configService.get<string>('jwt.accessExpiration', '15m');
    const refreshExpiration = this.configService.get<string>('jwt.refreshExpiration', '7d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: accessExpiration,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiration,
      }),
    ]);

    // Store HASHED refresh token — if DB is breached, tokens are still safe
    const hashedRefreshToken = await bcrypt.hash(refreshToken, this.BCRYPT_ROUNDS);

    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        token: hashedRefreshToken,
        userId: user.id,
        expiresAt: refreshExpiresAt,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  private async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private buildAuthResponse(user: User, tokens: TokenResponseDto): AuthResponseDto {
    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        role: user.role,
      },
      tokens,
    };
  }
}
