import { Controller, ForbiddenException, Get, Request } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CONTENT_READ } from '../auth/quiz-permissions';
import { XpService } from './xp.service';

@Controller('xp')
export class XpController {
  constructor(private readonly xpService: XpService) {}

  @Permissions(...CONTENT_READ)
  @Get('me')
  async getMe(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    const email = this.extractUserEmail(req);
    return email
      ? this.xpService.getSummary(userId, email)
      : this.xpService.getSummary(userId);
  }

  private extractUserEmail(req: ExpressRequest): string | undefined {
    const user = (
      req as ExpressRequest & {
        user?: {
          email?: unknown;
          user?: { email?: unknown };
          data?: { email?: unknown; user?: { email?: unknown } };
        };
      }
    ).user;
    return [
      user?.email,
      user?.user?.email,
      user?.data?.email,
      user?.data?.user?.email,
    ].find((v): v is string => typeof v === 'string' && v.trim().length > 0);
  }

  private extractUserId(req: ExpressRequest): string {
    const user = (
      req as ExpressRequest & {
        user?: {
          id?: unknown;
          sub?: unknown;
          user?: { id?: unknown };
          data?: { id?: unknown; user?: { id?: unknown } };
        };
      }
    ).user;
    const userId = [
      user?.id,
      user?.sub,
      user?.user?.id,
      user?.data?.id,
      user?.data?.user?.id,
    ].find((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (!userId) {
      throw new ForbiddenException('Unable to resolve authenticated user id');
    }
    return userId;
  }
}
