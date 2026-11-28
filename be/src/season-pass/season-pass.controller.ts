import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CONTENT_READ, CONTENT_UPDATE } from '../auth/quiz-permissions';
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

  @Permissions(...CONTENT_UPDATE)
  @Get('admin/seasons')
  async listAdminSeasons() {
    return this.seasonPassService.listAdminSeasons();
  }

  @Permissions(...CONTENT_UPDATE)
  @Post('admin/seasons')
  async createAdminSeason(
    @Body()
    body: {
      code?: string;
      title?: string;
      startsAt?: string;
      endsAt?: string;
      premiumPriceCoins?: number;
      isActive?: boolean;
    },
  ) {
    return this.seasonPassService.createAdminSeason({
      code: body?.code ?? '',
      title: body?.title ?? '',
      startsAt: body?.startsAt ?? '',
      endsAt: body?.endsAt ?? '',
      premiumPriceCoins: body?.premiumPriceCoins,
      isActive: body?.isActive,
    });
  }

  @Permissions(...CONTENT_UPDATE)
  @Patch('admin/seasons/:id')
  async updateAdminSeason(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      startsAt?: string;
      endsAt?: string;
      premiumPriceCoins?: number;
      isActive?: boolean;
    },
  ) {
    return this.seasonPassService.updateAdminSeason(id, body ?? {});
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('admin/seasons/:id/participants')
  async listAdminParticipants(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.seasonPassService.listAdminParticipants(
      id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Permissions(...CONTENT_UPDATE)
  @Post('admin/seasons/:id/grant')
  @HttpCode(HttpStatus.OK)
  async grantAdminBenefit(
    @Param('id') id: string,
    @Body()
    body: { userId?: string; isPremium?: boolean; bonusXpDelta?: number },
  ) {
    return this.seasonPassService.grantAdminBenefit(id, {
      userId: body?.userId ?? '',
      isPremium: body?.isPremium,
      bonusXpDelta: body?.bonusXpDelta,
    });
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
