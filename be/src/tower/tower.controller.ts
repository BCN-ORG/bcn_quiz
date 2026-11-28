import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  CONTENT_DELETE,
  CONTENT_READ,
  CONTENT_UPDATE,
} from '../auth/quiz-permissions';
import { TowerService } from './tower.service';
import { TowerAntiCheatService } from './tower-anticheat.service';
import { TowerBotGuard } from './tower-bot.guard';
import { TowerReconciliationService } from './coin/tower-reconciliation.service';
import { TowerPoolService } from './tower-pool.service';
import { TowerDistributionService } from './tower-distribution.service';
import { AnswerQuestionDto } from './dto/tower.dto';
import { UpdateDistributionConfigDto } from './dto/tower-admin.dto';

@Controller('tower')
export class TowerController {
  constructor(
    private readonly towerService: TowerService,
    private readonly reconciliationService: TowerReconciliationService,
    private readonly poolService: TowerPoolService,
    private readonly distributionService: TowerDistributionService,
    private readonly antiCheatService: TowerAntiCheatService,
  ) {}

  @Permissions(...CONTENT_READ)
  @Get('overview')
  async getOverview(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.towerService.getOverview(userId);
  }

  @Permissions(...CONTENT_READ)
  @UseGuards(TowerBotGuard)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('floor/start')
  @HttpCode(HttpStatus.OK)
  async startFloor(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.towerService.startFloorAttempt(userId);
  }

  @Permissions(...CONTENT_READ)
  @UseGuards(TowerBotGuard)
  @Throttle({ default: { limit: 12, ttl: 10_000 } })
  @Post('floor/answer')
  @HttpCode(HttpStatus.OK)
  async answerQuestion(
    @Request() req: ExpressRequest,
    @Body() dto: AnswerQuestionDto,
  ) {
    const userId = this.extractUserId(req);
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      typeof forwarded === 'string' && forwarded.trim()
        ? forwarded.split(',')[0].trim()
        : String(req.ip || req.socket?.remoteAddress || '');
    return this.towerService.answerFloorQuestion(
      userId,
      dto.optionLabel,
      dto.quizId,
      {
        ip,
        userAgent: String(req.headers['user-agent'] ?? ''),
        isTrusted: dto.isTrusted,
        webdriver: dto.webdriver,
      },
    );
  }

  @Permissions(...CONTENT_READ)
  @Get('transactions')
  async getTransactions(
    @Request() req: ExpressRequest,
    @Query('limit') limit?: string,
  ) {
    const userId = this.extractUserId(req);
    const parsedLimit = limit
      ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100)
      : 50;
    return this.towerService.getUserTransactions(userId, parsedLimit);
  }

  @Permissions(...CONTENT_UPDATE)
  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  async triggerReconcile() {
    return this.reconciliationService.reconcilePendingAndUnknown();
  }

  @Permissions(...CONTENT_READ)
  @Get('admin/pool/stats')
  async getPoolStats(@Query('seasonKey') seasonKey?: string) {
    return this.poolService.getPoolStats(seasonKey);
  }

  @Permissions(...CONTENT_UPDATE)
  @Post('admin/pool/sync')
  @HttpCode(HttpStatus.OK)
  async syncPool() {
    return this.poolService.syncPool();
  }

  @Permissions(...CONTENT_READ)
  @Get('admin/distribution')
  async getDistribution() {
    return this.distributionService.getActiveConfig();
  }

  @Permissions(...CONTENT_UPDATE)
  @Put('admin/distribution')
  @HttpCode(HttpStatus.OK)
  async updateDistribution(@Body() dto: UpdateDistributionConfigDto) {
    return this.distributionService.updateConfig(dto.rules, dto.name);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('admin/anticheat/overview')
  async getAntiCheatOverview() {
    const season = await this.towerService.getOrCreateCurrentSeason();
    return this.antiCheatService.getAdminOverview(season.id);
  }

  @Permissions(...CONTENT_UPDATE)
  @Post('admin/anticheat/:userId/block')
  @HttpCode(HttpStatus.OK)
  async blockTowerUser(
    @Param('userId') userId: string,
    @Body() body: { reason?: string },
  ) {
    const season = await this.towerService.getOrCreateCurrentSeason();
    return this.antiCheatService.blockUser(season.id, userId, body?.reason);
  }

  @Permissions(...CONTENT_UPDATE)
  @Post('admin/anticheat/:userId/unblock')
  @HttpCode(HttpStatus.OK)
  async unblockTowerUser(@Param('userId') userId: string) {
    const season = await this.towerService.getOrCreateCurrentSeason();
    return this.antiCheatService.unblockUser(season.id, userId);
  }

  @Permissions(...CONTENT_DELETE)
  @Post('admin/anticheat/:userId/reset-floor')
  @HttpCode(HttpStatus.OK)
  async resetTowerUserFloor(
    @Param('userId') userId: string,
    @Body() body: { targetFloor?: number },
  ) {
    const season = await this.towerService.getOrCreateCurrentSeason();
    return this.antiCheatService.resetUserFloor(
      season.id,
      userId,
      body?.targetFloor ?? 1,
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

    const userId = candidates.find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    );

    if (!userId) {
      throw new ForbiddenException('Unable to resolve authenticated user id');
    }

    return userId;
  }
}
