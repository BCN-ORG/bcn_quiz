import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { pathWithoutApiPrefix } from '../http-path';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<{
      originalUrl?: string;
      url?: string;
      path?: string;
    }>();
    const res = context.switchToHttp().getResponse();
    const url = req.originalUrl ?? req.url ?? req.path ?? '';
    const path = pathWithoutApiPrefix(url);

    if (
      path.startsWith('/quiz') ||
      path.startsWith('/attempt') ||
      path.startsWith('/progress') ||
      path.includes('/quizzes') ||
      path.includes('/session')
    ) {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    }

    if (path.startsWith('/auth') || path === '/health') {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({
        statusCode: res.statusCode,
        message: 'Success',
        data,
      })),
    );
  }
}
