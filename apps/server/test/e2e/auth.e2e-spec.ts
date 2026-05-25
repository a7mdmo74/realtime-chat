/**
 * test/e2e/auth.e2e-spec.ts
 *
 * END-TO-END TESTS:
 * E2E tests start a REAL NestJS application against a REAL test database.
 * They test the full HTTP stack: middleware → guard → controller → service → DB.
 *
 * SETUP:
 * - Uses a separate test database (DATABASE_URL points to test DB)
 * - Runs migrations before tests
 * - Cleans DB between test suites
 * - Does NOT mock — if the DB is down, tests fail (that's the point)
 *
 * WHY E2E TESTS MATTER:
 * Unit tests pass but the app is broken because of a misconfigured
 * guard or missing module import. E2E tests catch integration failures.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUser = {
    email: `test-${Date.now()}@example.com`,
    username: `testuser${Date.now()}`,
    displayName: 'Test User',
    password: 'TestP@ssw0rd!',
  };

  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply same global config as main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('api');

    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: { email: { contains: testUser.email } },
    });
    await app.close();
  });

  // ─── POST /auth/register ───────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user (201)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
      expect(response.body.data.tokens.accessToken).toBeDefined();
      expect(response.body.data.tokens.refreshToken).toBeDefined();

      // Save for subsequent tests
      accessToken = response.body.data.tokens.accessToken;
      refreshToken = response.body.data.tokens.refreshToken;
    });

    it('should reject duplicate email (409)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.statusCode).toBe(409);
    });

    it('should reject weak password (400)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...testUser, email: 'weak@test.com', password: '123' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid email (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...testUser, email: 'not-an-email' })
        .expect(400);
    });
  });

  // ─── POST /auth/login ──────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials (200)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      expect(response.body.data.tokens.accessToken).toBeDefined();
    });

    it('should reject wrong password (401)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: 'WrongPassword123!' })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid credentials');
    });

    it('should reject unknown email (401)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'Password123!' })
        .expect(401);

      // SECURITY: Same message — no user enumeration
      expect(response.body.error.message).toBe('Invalid credentials');
    });
  });

  // ─── POST /auth/refresh ────────────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('should issue new token pair (200)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();

      // Old refresh token is now invalid (rotation)
      const oldRefreshToken = refreshToken;
      refreshToken = response.body.data.refreshToken;
      accessToken = response.body.data.accessToken;

      // Attempt to reuse the old token — should fail
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(401);
    });
  });

  // ─── Protected route test ──────────────────────────────────────────────────

  describe('GET /api/v1/users/me (protected)', () => {
    it('should return current user with valid token (200)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.email).toBe(testUser.email);
    });

    it('should reject request without token (401)', async () => {
      await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    });

    it('should reject expired/invalid token (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });
  });
});
