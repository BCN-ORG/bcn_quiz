import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CONTENT_READ } from '../auth/quiz-permissions';
import { QuestService } from './quest.service';

@Controller('quests')
export class QuestController {
  constructor(private readonly questService: QuestService) {}

  @Permissions(...CONTENT_READ)
  @Get('me')
  async getMyQuests(@Request() req: ExpressRequest) {
    return this.questService.getMyQuests(this.extractUserId(req));
  }

  @Permissions(...CONTENT_READ)
  @Post(':questCode/claim')
  @HttpCode(HttpStatus.OK)
  async claimQuest(
    @Request() req: ExpressRequest,
    @Param('questCode') questCode: string,
  ) {
    return this.questService.claimQuest(this.extractUserId(req), questCode);
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
    const candidates = [
      user?.id,
      user?.sub,
      user?.user?.id,
      user?.data?.id,
      user?.data?.user?.id,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    throw new ForbiddenException('Missing authenticated user id');
  }
}
