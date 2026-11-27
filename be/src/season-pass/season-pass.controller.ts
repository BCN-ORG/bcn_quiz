import {
  Body,
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
import { SeasonPassService } from './season-pass.service';

@Controller('season-pass')
export class SeasonPassController {
  constructor(private readonly seasonPassService: SeasonPassService) {}

  @Permissions(...CONTENT_READ)
  @Get('current')
  async getCurrent(@Request() req: ExpressRequest) {
    return this.seasonPassService.getCurrentProgress(this.extractUserId(req));
  }

  @Permissions(...CONTENT_READ)
  @Post('upgrade-premium')
  @HttpCode(HttpStatus.OK)
  async upgradePremium(@Request() req: ExpressRequest) {
    return this.seasonPassService.upgradePremium(this.extractUserId(req));
  }

  @Permissions(...CONTENT_READ)
  @Post('claim/:tier')
  @HttpCode(HttpStatus.OK)
  async claimTier(
    @Request() req: ExpressRequest,
    @Param('tier') tier: string,
    @Body() body: { track?: 'free' | 'premium' },
  ) {
    return this.seasonPassService.claimTier(
      this.extractUserId(req),
      Number(tier),
      body?.track === 'premium' ? 'premium' : 'free',
    );
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
