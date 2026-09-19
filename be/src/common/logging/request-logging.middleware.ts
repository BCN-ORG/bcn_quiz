import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from './request-context';

type RequestUser = {
  id?: unknown;
  userId?: unknown;
  sub?: unknown;
  data?: {
    id?: unknown;
    user?: {
      id?: unknown;
      userId?: unknown;
      sub?: unknown;
    };
  };
};

type TimedResponse = Response & {
  __requestTimingPatched?: boolean;
};

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLoggingMiddleware.name);

  use(
    request: Request & { user?: RequestUser },
    response: TimedResponse,
    next: NextFunction,
  ): void {
    const store = RequestContext.createStore();
    const method = request.method;
    const url = request.originalUrl ?? request.url;

    RequestContext.run(store, () => {
      response.setHeader('X-Request-Id', store.requestId);

      if (!response.__requestTimingPatched) {
        response.__requestTimingPatched = true;
        const originalWriteHead = response.writeHead.bind(response);
        response.writeHead = ((...args: Parameters<Response['writeHead']>) => {
          if (!response.headersSent) {
            response.setHeader(
              'X-Response-Time-Ms',
              String(Date.now() - store.startedAt),
            );
          }
          return originalWriteHead(...args);
        }) as Response['writeHead'];
      }

      response.on('finish', () => {
        const durationMs = Date.now() - store.startedAt;
        const status = response.statusCode;
        const userId = this.extractUserId(request.user);
        const line = `${method} ${url} ${status} ${durationMs}ms${userId ? ` user=${userId}` : ''}`;
        if (status >= 500) this.logger.error(line);
        else if (status >= 400) this.logger.warn(line);
        else this.logger.log(line);
      });

      next();
    });
  }

  private extractUserId(user?: RequestUser): string | undefined {
    const candidates = [
      user?.id,
      user?.userId,
      user?.sub,
      user?.data?.id,
      user?.data?.user?.id,
      user?.data?.user?.userId,
      user?.data?.user?.sub,
    ];

    const userId = candidates.find(
      (value): value is string | number =>
        (typeof value === 'string' && value.trim().length > 0) ||
        typeof value === 'number',
    );

    return userId === undefined ? undefined : String(userId);
  }
}
