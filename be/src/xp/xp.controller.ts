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
    return this.xpService.getSummary(this.extractUserId(req));
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
