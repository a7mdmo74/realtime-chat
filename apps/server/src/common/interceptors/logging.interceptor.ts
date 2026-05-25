/**
 * src/common/interceptors/logging.interceptor.ts
 *
 * WHY THIS INTERCEPTOR:
 * Every HTTP request should be logged with:
 *   - Method, path, status code
 *   - Response time (for performance monitoring)
 *   - Request ID (for log correlation across services)
 *   - User ID (for audit trails)
 *
 * This is different from access logging (Nginx/load balancer level).
 * Application-level logging gives us business context that infra can't.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { AppLogger } from '../../logger/logger.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    // Attach a unique request ID for log correlation
    const requestId = (request.headers['x-request-id'] as string) || uuidv4();
    request.headers['x-request-id'] = requestId;
    response.setHeader('X-Request-Id', requestId);

    const userId = (request as any).user?.id;
    const { method, url } = request;

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          const statusCode = response.statusCode;
          this.logger.log(
            `${method} ${url} ${statusCode} +${duration}ms`,
            `${requestId}${userId ? ` uid:${userId}` : ''}`,
          );
        },
        error: (error: Error) => {
          const duration = Date.now() - start;
          this.logger.error(
            `${method} ${url} ERROR +${duration}ms`,
            error.stack,
            `${requestId}${userId ? ` uid:${userId}` : ''}`,
          );
        },
      }),
    );
  }
}
