import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Unified error envelope matching success ResponseInterceptor shape:
 * { statusCode, message, error, data }
 */
@Catch()
export class HttpExceptionEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionEnvelopeFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const { message, error, details } = this.normalize(exception, status);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl ?? request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      data: details ?? null,
    });
  }

  private normalize(
    exception: unknown,
    status: number,
  ): { message: string | string[]; error: string; details?: unknown } {
    const fallbackError = HttpStatus[status] ?? 'Error';

    if (!(exception instanceof HttpException)) {
      return {
        message: 'Internal server error',
        error: String(fallbackError),
      };
    }

    const body = exception.getResponse();
    if (typeof body === 'string') {
      return { message: body, error: String(fallbackError) };
    }

    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      const message = record.message ?? exception.message;
      const error =
        typeof record.error === 'string' ? record.error : String(fallbackError);

      const details =
        record.data !== undefined
          ? record.data
          : record.errors !== undefined
            ? record.errors
            : record.code !== undefined || record.details !== undefined
              ? {
                  ...(record.code !== undefined ? { code: record.code } : {}),
                  ...(record.details !== undefined
                    ? { details: record.details }
                    : {}),
                }
              : null;

      return {
        message: message as string | string[],
        error,
        details: details === null ? undefined : details,
      };
    }

    return { message: exception.message, error: String(fallbackError) };
  }
}
