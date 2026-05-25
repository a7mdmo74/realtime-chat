/**
 * src/logger/logger.service.ts
 *
 * WHY PINO OVER WINSTON:
 * Pino is ~5x faster than Winston, outputs NDJSON by default (machine-readable),
 * and integrates with the entire Node.js ecosystem. In production, logs are
 * streamed to Datadog/Loki/CloudWatch where JSON is parsed automatically.
 *
 * WHY A CUSTOM LOGGER SERVICE:
 * NestJS's built-in logger is console.log wrappers. We need:
 *   - Log levels (trace, debug, info, warn, error, fatal)
 *   - Structured context (requestId, userId, chatId)
 *   - Pretty-printing in dev, JSON in production
 *   - Child loggers for module-scoped context
 *
 * SENIOR PRACTICE: Every log entry has a context field so you can filter
 * by module in production dashboards.
 */

import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as pino from 'pino';

@Injectable()
export class AppLogger implements LoggerService {
  private logger: pino.Logger;

  constructor(private configService: ConfigService) {
    const isDev = configService.get('app.isDevelopment', true);
    const level = configService.get('LOG_LEVEL', 'info');

    this.logger = pino.default({
      level,
      ...(isDev
        ? {
            // Pretty-print in development for human readability
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            },
          }
        : {
            // Raw JSON in production for log aggregators
            formatters: {
              level: (label: string) => ({ level: label }),
            },
            timestamp: pino.stdTimeFunctions.isoTime,
          }),
    });
  }

  /**
   * Create a child logger with persistent context bound to it.
   * Usage: this.logger.child({ requestId, userId }).info('message')
   */
  child(bindings: Record<string, unknown>): pino.Logger {
    return this.logger.child(bindings);
  }

  log(message: string, context?: string): void {
    this.logger.info({ context }, message);
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error({ context, trace }, message);
  }

  warn(message: string, context?: string): void {
    this.logger.warn({ context }, message);
  }

  debug(message: string, context?: string): void {
    this.logger.debug({ context }, message);
  }

  verbose(message: string, context?: string): void {
    this.logger.trace({ context }, message);
  }

  fatal(message: string, context?: string): void {
    this.logger.fatal({ context }, message);
  }
}
