/**
 * src/common/filters/ws-exceptions.filter.ts
 *
 * WHY A SEPARATE WS FILTER:
 * WebSocket errors can't use HTTP response codes. Instead, they emit
 * an error event back to the client socket. This filter catches all
 * errors thrown inside @SubscribeMessage handlers and emits them
 * in a consistent shape back to the caller.
 */

import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Catch()
export class WsExceptionsFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();

    let errorPayload: { message: string; errorCode?: string };

    if (exception instanceof WsException) {
      const error = exception.getError();
      errorPayload =
        typeof error === 'string'
          ? { message: error }
          : (error as { message: string; errorCode?: string });
    } else if (exception instanceof HttpException) {
      const response = exception.getResponse();
      errorPayload =
        typeof response === 'string'
          ? { message: response }
          : { message: (response as Record<string, unknown>).message as string };
    } else {
      errorPayload = { message: 'Internal server error', errorCode: 'WS_ERROR' };
    }

    client.emit('error', {
      ...errorPayload,
      timestamp: new Date().toISOString(),
    });
  }
}
