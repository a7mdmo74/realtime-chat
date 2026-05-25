/**
 * src/common/filters/all-exceptions.filter.ts
 *
 * WHY A GLOBAL EXCEPTION FILTER:
 * Without this, unhandled exceptions produce inconsistent error shapes:
 *   - NestJS HTTP exceptions: { statusCode, message, error }
 *   - Prisma errors: raw Prisma error objects
 *   - Validation errors: array of constraint failures
 *   - Unexpected errors: stack traces leaked to clients
 *
 * This filter normalizes ALL errors into one predictable shape AND:
 *   - Logs errors with full context (requestId, userId, path)
 *   - Maps Prisma error codes to HTTP statuses
 *   - Never leaks stack traces to clients in production
 *   - Returns validation errors in a developer-friendly format
 *
 * SENIOR PRACTICE: The filter is the security boundary between your
 * internal error model and what the outside world sees.
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Request } from 'express';

// The consistent shape we return for ALL errors
interface ErrorResponse {
  success: false;
  error: {
    statusCode: number;
    message: string | string[];
    error: string;
    errorCode?: string;  // Machine-readable code for frontend handling
  };
  timestamp: string;
  path: string;
  requestId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, errorCode } = this.resolveError(exception);

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        statusCode,
        message,
        error: HttpStatus[statusCode] || 'Unknown Error',
        ...(errorCode && { errorCode }),
      },
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
      requestId: request.headers['x-request-id'] as string,
    };

    // Log with appropriate severity
    if (statusCode >= 500) {
      this.logger.error(
        `[${statusCode}] ${request.method} ${request.url}: ${JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : undefined,
        AllExceptionsFilter.name,
      );
    } else if (statusCode >= 400) {
      this.logger.warn(
        `[${statusCode}] ${request.method} ${request.url}: ${JSON.stringify(message)}`,
        AllExceptionsFilter.name,
      );
    }

    httpAdapter.reply(ctx.getResponse(), errorResponse, statusCode);
  }

  private resolveError(exception: unknown): {
    statusCode: number;
    message: string | string[];
    errorCode?: string;
  } {
    // NestJS HTTP Exceptions (most common path)
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const statusCode = exception.getStatus();

      if (typeof response === 'object' && response !== null) {
        const resp = response as Record<string, unknown>;
        return {
          statusCode,
          message: (resp.message as string | string[]) || exception.message,
        };
      }

      return { statusCode, message: exception.message };
    }

    // Prisma Known Request Errors (DB constraint violations, not-found, etc.)
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaError(exception);
    }

    // Prisma Validation Errors (invalid query construction — programming bugs)
    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.error('Prisma validation error — this is a bug', exception.message);
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Database query error',
        errorCode: 'DB_QUERY_ERROR',
      };
    }

    // Unknown/unexpected errors — 500 with no details leaked
    this.logger.error('Unhandled exception', exception);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      errorCode: 'INTERNAL_ERROR',
    };
  }

  /**
   * Maps Prisma error codes to meaningful HTTP responses.
   * https://www.prisma.io/docs/reference/api-reference/error-reference
   */
  private handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    message: string;
    errorCode: string;
  } {
    switch (error.code) {
      case 'P2002': // Unique constraint violation
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `Resource already exists: ${this.extractField(error)}`,
          errorCode: 'DUPLICATE_RESOURCE',
        };

      case 'P2025': // Record not found
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Resource not found',
          errorCode: 'NOT_FOUND',
        };

      case 'P2003': // Foreign key constraint failed
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Referenced resource does not exist',
          errorCode: 'INVALID_REFERENCE',
        };

      case 'P2014': // Relation violation
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Operation would violate a required relation',
          errorCode: 'RELATION_VIOLATION',
        };

      default:
        this.logger.error(`Unhandled Prisma error ${error.code}`, error.message);
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error',
          errorCode: `DB_${error.code}`,
        };
    }
  }

  private extractField(error: Prisma.PrismaClientKnownRequestError): string {
    const meta = error.meta as { target?: string[] } | undefined;
    return meta?.target?.join(', ') || 'field';
  }
}
