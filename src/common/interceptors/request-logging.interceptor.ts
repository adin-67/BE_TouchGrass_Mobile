import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const suppliedRequestId = request.header('x-request-id');
    const requestId =
      suppliedRequestId && suppliedRequestId.length <= 100
        ? suppliedRequestId
        : randomUUID();
    response.setHeader('x-request-id', requestId);
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () =>
          this.log(
            'request_completed',
            requestId,
            request.method,
            request.originalUrl,
            response.statusCode,
            Date.now() - startedAt,
          ),
        error: (error: unknown) =>
          this.log(
            'request_failed',
            requestId,
            request.method,
            request.originalUrl,
            error instanceof HttpException ? error.getStatus() : 500,
            Date.now() - startedAt,
          ),
      }),
    );
  }

  private log(
    event: string,
    requestId: string,
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
  ): void {
    this.logger.log(
      JSON.stringify({
        event,
        requestId,
        method,
        path,
        statusCode,
        durationMs,
      }),
    );
  }
}
