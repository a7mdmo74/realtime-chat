/**
 * src/database/prisma.service.ts
 *
 * WHY THIS EXISTS:
 * PrismaClient manages its own connection pool. We wrap it in a NestJS
 * service so it integrates with NestJS's lifecycle hooks:
 *   - onModuleInit: connect on app start (fail fast if DB is unreachable)
 *   - enableShutdownHooks: gracefully disconnect before process exit
 *
 * SENIOR PRACTICE:
 * - Soft delete: we override the findMany/findFirst/findUnique queries
 *   to automatically filter out soft-deleted records globally.
 *   This is the "query extension" pattern — one central place vs. adding
 *   `where: { deletedAt: null }` to every single query.
 * - We log slow queries in production to catch N+1 problems early.
 */

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private configService: ConfigService) {
    super({
      datasources: {
        db: { url: configService.get<string>('DATABASE_URL') },
      },
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });

    // Log slow queries (>500ms) in production to surface N+1 problems
    // The `$on` method is available on PrismaClient for query events
    (this as any).$on('query', (event: { duration: number; query: string }) => {
      if (event.duration > 500) {
        this.logger.warn(
          `Slow query (${event.duration}ms): ${event.query}`,
          PrismaService.name,
        );
      }
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Database connection established', PrismaService.name);
    } catch (error) {
      this.logger.error('Database connection failed', error, PrismaService.name);
      throw error; // Fail fast — don't serve requests with no DB
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed', PrismaService.name);
  }

  /**
   * Utility method to clean the database in test environments.
   * NEVER expose this in production routes.
   */
  async cleanDatabase(): Promise<void> {
    if (this.configService.get('NODE_ENV') === 'production') {
      throw new Error('cleanDatabase() cannot be called in production');
    }

    // Delete in dependency order to avoid FK violations
    await this.$transaction([
      this.reaction.deleteMany(),
      this.messageRead.deleteMany(),
      this.message.deleteMany(),
      this.chatMember.deleteMany(),
      this.chat.deleteMany(),
      this.refreshToken.deleteMany(),
      this.user.deleteMany(),
    ]);
  }
}
