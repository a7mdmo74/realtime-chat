/**
 * src/app.module.ts
 *
 * THE ROOT MODULE — the composition root of the entire application.
 *
 * ORDER OF IMPORTS MATTERS:
 * 1. ConfigModule first — everything else depends on config
 * 2. Global infrastructure (Database, Redis, Logger) next
 * 3. Feature modules last
 *
 * GLOBAL GUARD REGISTRATION:
 * JwtAuthGuard is applied globally here. Every route is protected by
 * default. Routes that should be public use the @Public() decorator.
 * This is "secure by default" — you opt OUT of security, not IN.
 *
 * THROTTLER:
 * Rate limiting is applied globally. Individual routes can override
 * with @Throttle({ default: { ttl, limit } }).
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

// Config
import {
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  throttleConfig,
  corsConfig,
  uploadConfig,
} from './config/app.config';
import { envValidationSchema } from './config/env.validation';

// Infrastructure
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { LoggerModule } from './logger/logger.module';

// Common
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

// Feature Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ChatModule } from './modules/chat/chat.module';
import { MessagesModule } from './modules/messages/messages.module';
import { HealthModule } from './common/health/health.module';

@Module({
  imports: [
    // ── Configuration ────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,          // Available in all modules without re-importing
      cache: true,             // Cache env values for performance
      load: [
        appConfig,
        databaseConfig,
        redisConfig,
        jwtConfig,
        throttleConfig,
        corsConfig,
        uploadConfig,
      ],
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,    // Allow system env vars (PATH, HOME, etc.)
        abortEarly: false,     // Report ALL validation errors, not just first
      },
    }),

    // ── Rate Limiting ────────────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
            limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
          },
        ],
      }),
    }),

    // ── Infrastructure (Global) ───────────────────────────────────────────────
    LoggerModule,
    DatabaseModule,
    RedisModule,

    // ── Feature Modules ───────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    MessagesModule,
    ChatModule,
    HealthModule,
  ],

  providers: [
    // ── Global Exception Filter ───────────────────────────────────────────────
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },

    // ── Global Guards (applied to all routes) ─────────────────────────────────
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,  // All routes protected by default
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,    // Role checks via @Roles() decorator
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // Rate limiting on all routes
    },

    // ── Global Interceptors ───────────────────────────────────────────────────
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule {}
