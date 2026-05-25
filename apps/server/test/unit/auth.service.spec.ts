/**
 * test/unit/auth.service.spec.ts
 *
 * UNIT TEST PHILOSOPHY:
 * Unit tests test ONE thing in isolation. All dependencies are mocked.
 * We test:
 *   1. Business logic (what happens when input is valid/invalid?)
 *   2. Side effects (does it call the right methods?)
 *   3. Error paths (does it throw the right exception?)
 *
 * MOCKING STRATEGY:
 * We use jest.fn() and createMockObject helpers to create typed mocks.
 * Avoid partial mocks — mock the entire interface to prevent accidental
 * real calls leaking into unit tests.
 *
 * WHAT WE DO NOT TEST HERE:
 * - Database queries (that's integration testing)
 * - JWT library internals (trust the library)
 * - bcrypt hashing correctness (trust the library)
 * We test that WE CALL these correctly.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../src/modules/auth/auth.service';
import { PrismaService } from '../../src/database/prisma.service';
import { AppLogger } from '../../src/logger/logger.service';
import * as bcrypt from 'bcrypt';

// ─── Typed Mock Helpers ───────────────────────────────────────────────────────

type DeepMock<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? jest.MockedFunction<T[K]>
    : DeepMock<T[K]>;
};

const createMockPrisma = () => ({
  user: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
});

const createMockJwtService = () => ({
  signAsync: jest.fn().mockResolvedValue('mock.jwt.token'),
  verifyAsync: jest.fn(),
});

const createMockConfigService = () => ({
  get: jest.fn().mockImplementation((key: string) => {
    const config: Record<string, string | number> = {
      'jwt.accessSecret': 'test-access-secret',
      'jwt.refreshSecret': 'test-refresh-secret',
      'jwt.accessExpiration': '15m',
      'jwt.refreshExpiration': '7d',
    };
    return config[key];
  }),
});

const createMockLogger = () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
});

// ─── Test Data ────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-uuid-123',
  email: 'test@example.com',
  username: 'testuser',
  displayName: 'Test User',
  passwordHash: '$2b$12$hashedpassword',
  avatarUrl: null,
  role: 'USER' as const,
  presenceStatus: 'OFFLINE' as const,
  lastSeenAt: null,
  emailVerified: true,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  bio: null,
};

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let jwtService: ReturnType<typeof createMockJwtService>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    jwtService = createMockJwtService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: createMockConfigService() },
        { provide: AppLogger, useValue: createMockLogger() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── register() ────────────────────────────────────────────────────────────

  describe('register()', () => {
    const registerDto = {
      email: 'new@example.com',
      username: 'newuser',
      displayName: 'New User',
      password: 'SecureP@ss1!',
    };

    it('should register a new user and return auth response', async () => {
      prisma.user.findFirst.mockResolvedValue(null); // No existing user
      prisma.user.create.mockResolvedValue({ ...mockUser, email: registerDto.email });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(mockUser.email);

      // Verify password is never returned
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should throw ConflictException if email already exists', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, email: registerDto.email });

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      await expect(service.register(registerDto)).rejects.toThrow(
        'Email is already registered',
      );
    });

    it('should throw ConflictException if username already exists', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        email: 'different@example.com', // Different email
        username: registerDto.username,  // Same username
      });

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      await expect(service.register(registerDto)).rejects.toThrow(
        'Username is already taken',
      );
    });

    it('should hash the password before storing', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.refreshToken.create.mockResolvedValue({});

      await service.register(registerDto);

      // Verify create was called with a hash, not plain text
      const createCall = prisma.user.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).toBeDefined();
      expect(createCall.data.passwordHash).not.toBe(registerDto.password);
      expect(createCall.data).not.toHaveProperty('password');
    });
  });

  // ─── login() ───────────────────────────────────────────────────────────────

  describe('login()', () => {
    const loginDto = { email: mockUser.email, password: 'correctpassword' };

    it('should return auth tokens on valid credentials', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('tokens.accessToken');
      expect(result).toHaveProperty('tokens.refreshToken');
    });

    it('should throw UnauthorizedException when user not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      // SECURITY: Must NOT reveal which one failed (user enumeration prevention)
      await expect(service.login(loginDto)).rejects.toThrow('Invalid credentials');
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      // SECURITY: Same message as "user not found" — no enumeration
      await expect(service.login(loginDto)).rejects.toThrow('Invalid credentials');
    });
  });

  // ─── refreshTokens() ───────────────────────────────────────────────────────

  describe('refreshTokens()', () => {
    const mockRefreshToken = {
      id: 'token-id',
      userId: mockUser.id,
      token: '$2b$12$hashedtoken',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days future
      user: mockUser,
    };

    it('should rotate tokens and return new pair', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(mockRefreshToken);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refreshTokens(mockUser.id, 'token-id', 'raw-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');

      // Verify old token was revoked
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-id' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('should revoke ALL tokens if token not found (possible theft)', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(null);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await expect(
        service.refreshTokens(mockUser.id, 'invalid-token-id', 'raw-token'),
      ).rejects.toThrow(UnauthorizedException);

      // Should revoke all tokens as a security measure
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUser.id, revokedAt: null },
        }),
      );
    });
  });
});
