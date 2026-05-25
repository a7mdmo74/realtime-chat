/**
 * src/common/interceptors/response.interceptor.ts
 *
 * WHY A RESPONSE INTERCEPTOR:
 * Every controller returns raw data. This interceptor wraps it in the
 * standard ApiResponse envelope so the frontend always gets:
 *   { success: true, data: ..., timestamp: ..., path: ... }
 *
 * SENIOR PRACTICE:
 * Using NestJS interceptors (not middleware) because interceptors have
 * access to the RxJS Observable, meaning we can transform the response
 * after the controller has executed. Middleware runs before controllers.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import { ApiResponse } from '../interfaces';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((data) => ({
        success: true,
        data: data?.data ?? data,
        ...(data?.meta && { meta: data.meta }),
        timestamp: new Date().toISOString(),
        path: request.url,
      })),
    );
  }
}
