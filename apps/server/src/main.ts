/**
 * src/main.ts
 *
 * APPLICATION BOOTSTRAP — where the NestJS application is fully configured.
 *
 * THIS FILE IS THE ONLY PLACE where framework-level configuration lives:
 *   - Helmet (HTTP security headers)
 *   - CORS
 *   - Compression
 *   - Global ValidationPipe
 *   - Swagger documentation
 *   - API versioning
 *   - Logger override
 *   - Graceful shutdown hooks
 *
 * SENIOR PRACTICES:
 * 1. enableShutdownHooks() — lets Prisma/Redis close connections on SIGTERM
 *    (critical for zero-downtime deploys in Kubernetes)
 * 2. Global ValidationPipe with `transform: true` — auto-converts query
 *    params from strings to numbers/booleans (HTTP is string-only)
 * 3. `whitelist: true` — strips any property not in the DTO (security)
 * 4. `forbidNonWhitelisted: true` — throws if extra props are sent (strict mode)
 * 5. Swagger only enabled in non-production (don't expose API schema publicly)
 */

import { NestFactory } from '@nestjs/core'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpAdapterHost } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import * as compression from 'compression'
import helmet from 'helmet'
import { Request, Response } from 'express'
import { join } from 'path'
import { AppModule } from './app.module'
import { AppLogger } from './logger/logger.service'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Suppress NestJS default logger — we'll use our Pino logger
    bufferLogs: true,
  })

  const configService = app.get(ConfigService)
  const logger = app.get(AppLogger)

  // ── Override built-in logger with our Pino logger ─────────────────────────
  app.useLogger(logger)

  // ── Graceful Shutdown ─────────────────────────────────────────────────────
  // Enables onModuleDestroy hooks (PrismaService.$disconnect, etc.)
  // Essential for zero-downtime Kubernetes rolling deploys
  app.enableShutdownHooks()

  // ── Security Headers (Helmet) ─────────────────────────────────────────────
  // Sets: X-XSS-Protection, X-Frame-Options, Strict-Transport-Security, etc.
  // Must come before routes
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false, // Required for Swagger UI to work
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
          scriptSrc: ["'self'", "https: 'unsafe-inline'"],
        },
      },
    })
  )

  // ── CORS ──────────────────────────────────────────────────────────────────
  const corsOrigins = configService.get<string[]>('cors.origin', [])
  app.enableCors({
    origin: corsOrigins,
    credentials: true, // Allow cookies and auth headers
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Api-Version'],
    exposedHeaders: ['X-Request-Id'], // Let frontend read request ID
  })

  // ── Compression ───────────────────────────────────────────────────────────
  // Gzip responses > 1KB. Important for message history payloads.
  app.use(compression())

  // ── API Versioning ────────────────────────────────────────────────────────
  // URL-based versioning: /api/v1/... and /api/v2/... can coexist
  // Allows backwards-compatible rollouts
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  })

  // ── Global Prefix ─────────────────────────────────────────────────────────
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api')
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['/health', '/ready'], // Health check endpoints at root
  })

  const port = configService.get<number>('app.port', 3000)

  // ── Global Validation Pipe ────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // Auto-transform payloads to DTO instances
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw on unknown properties (strict)
      transformOptions: {
        enableImplicitConversion: true, // Convert query strings to proper types
      },
      stopAtFirstError: false, // Return ALL validation errors at once
    })
  )

  // ── Global Exception Filter ───────────────────────────────────────────────
  // Registered here in addition to APP_FILTER to get HttpAdapterHost
  const httpAdapterHost = app.get(HttpAdapterHost)
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost))

  // ── Swagger API Documentation ─────────────────────────────────────────────
  const isProduction = configService.get<boolean>('app.isProduction', false)

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Realtime Chat API')
      .setDescription(
        `## Production-Grade NestJS Chat API
        
WebSocket events are documented in the [WebSocket Events](#) section.

### Authentication
All endpoints require \`Authorization: Bearer <access_token>\` header,
except \`/auth/register\` and \`/auth/login\`.

### Rate Limiting
- Login: 10 requests/minute per IP
- Register: 5 requests/minute per IP  
- Other endpoints: 100 requests/minute per IP`
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter your JWT access token',
          in: 'header',
        },
        'access-token'
      )
      .addTag('Authentication', 'Register, login, token management')
      .addTag('Users', 'User profiles and presence')
      .addTag('Chats', 'Chat rooms and DMs')
      .addTag('Messages', 'Message CRUD and reactions')
      .build()
    const expressApp = app.getHttpAdapter().getInstance()
    expressApp.get(
      `/${apiPrefix}/docs/postman-collection.json`,
      (_req: Request, res: Response) => {
        res.sendFile(join(process.cwd(), 'postman-collection.json'))
      }
    )

    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      jsonDocumentUrl: `${apiPrefix}/docs/openapi.json`,
      yamlDocumentUrl: `${apiPrefix}/docs/openapi.yaml`,
      swaggerOptions: {
        persistAuthorization: true, // Don't lose token on page refresh
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    })

    logger.log(`Swagger docs: http://localhost:${port}/${apiPrefix}/docs`, 'Bootstrap')
    logger.log(`OpenAPI JSON: http://localhost:${port}/${apiPrefix}/docs/openapi.json`, 'Bootstrap')
    logger.log(
      `Postman collection: http://localhost:${port}/${apiPrefix}/docs/postman-collection.json`,
      'Bootstrap'
    )
  }

  // ── Start Server ──────────────────────────────────────────────────────────
  await app.listen(port, '0.0.0.0') // Bind to all interfaces (needed in Docker)

  logger.log(`Application running on: http://localhost:${port}/${apiPrefix}/v1`, 'Bootstrap')
  logger.log(`Environment: ${configService.get<string>('app.nodeEnv')}`, 'Bootstrap')

  // ── Unhandled Rejection Safety Net ───────────────────────────────────────
  process.on('unhandledRejection', (reason, promise) => {
    logger.error(
      `Unhandled Rejection at: ${String(promise)}, reason: ${String(reason)}`,
      undefined,
      'Process'
    )
  })

  process.on('uncaughtException', error => {
    logger.fatal(`Uncaught Exception: ${error.message}`, 'Process')
    process.exit(1) // Let process manager (PM2/K8s) restart the app
  })
}

bootstrap()
