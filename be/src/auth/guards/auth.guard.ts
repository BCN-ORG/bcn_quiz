import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RequestContext } from '../../common/logging/request-context';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { extractBearerToken } from '../auth-header.util';

@Injectable()
export class BearerAuthGuard implements CanActivate {
  private readonly logger = new Logger(BearerAuthGuard.name);

  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: unknown }>();
    const cookieHeader = req.headers.cookie ?? '';
    const authorization = req.headers.authorization;
    const bearerToken = extractBearerToken(authorization);
    const cookieToken = this.extractCookieToken(cookieHeader);
    const token = bearerToken ?? cookieToken;
    const tokenSource = bearerToken
      ? 'bearer'
      : cookieToken
        ? 'cookie'
        : 'none';

    const authStartedAt = Date.now();
    try {
      req.user = await this.authService.validateToken(
        token,
        cookieHeader,
        authorization,
      );

      RequestContext.recordAuthDuration(Date.now() - authStartedAt);
      this.logger.debug(
        `[guard] auth success ${req.method} ${req.originalUrl} tokenSource=${tokenSource}`,
      );
      return true;
    } catch {
      RequestContext.recordAuthDuration(Date.now() - authStartedAt);
      this.logger.warn(
        `[guard] auth failed ${req.method} ${req.originalUrl} tokenSource=${tokenSource}`,
      );
      throw new UnauthorizedException('Invalid token or unauthorized');
    }
  }

  private extractCookieToken(cookieHeader: string): string | undefined {
    if (!cookieHeader) {
      return undefined;
    }

    const cookies = cookieHeader.split(';').map((part) => part.trim());
    const tokenKeys = ['quiz_access_token'];

    for (const key of tokenKeys) {
      const matched = cookies.find((part) => part.startsWith(`${key}=`));
      if (matched) {
        return decodeURIComponent(matched.slice(`${key}=`.length));
      }
    }

    return undefined;
  }
}
