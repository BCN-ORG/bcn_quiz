import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Put,
  HttpStatus,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  CONTENT_DELETE,
  CONTENT_READ,
  CONTENT_UPDATE,
} from '../auth/quiz-permissions';
import { BossAdminService } from './boss-admin.service';
import { BossLiveService } from './boss-live.service';
import { BossService } from './boss.service';
import { BossReconciliationService } from './coin/boss-reconciliation.service';
import {
  SettleWeekDto,
  SubmitBossAnswerDto,
  UpsertBossSeasonDto,
} from './dto/boss.dto';

@Controller('boss')
export class BossController {
  constructor(
    private readonly bossService: BossService,
    private readonly liveService: BossLiveService,
    private readonly adminService: BossAdminService,
    private readonly reconciliationService: BossReconciliationService,
  ) {}

  @Permissions(...CONTENT_READ)
  @Get('overview')
  async getOverview(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.bossService.getOverview(userId);
  }

  /** Side-effect free snapshot for the "fighting together" strip; safe to poll while playing. */
  @Permissions(...CONTENT_READ)
  @Get('live')
  async getLive(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.liveService.getLive(userId);
  }

  @Permissions(...CONTENT_READ)
  @Post('session/start')
  @HttpCode(HttpStatus.OK)
  async startSession(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.bossService.startSession(userId);
  }

  @Permissions(...CONTENT_READ)
  @Post('session/answer')
  @HttpCode(HttpStatus.OK)
  async submitAnswer(
    @Request() req: ExpressRequest,
    @Body() dto: SubmitBossAnswerDto,
  ) {
    const userId = this.extractUserId(req);
    return this.bossService.submitAnswer(userId, dto.optionLabel);
  }

  @Permissions(...CONTENT_READ)
  @Post('session/next')
  @HttpCode(HttpStatus.OK)
  async nextQuestion(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.bossService.nextQuestion(userId);
  }

  @Permissions(...CONTENT_READ)
  @Post('session/abandon')
  @HttpCode(HttpStatus.OK)
  async abandonSession(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.bossService.abandonSession(userId);
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
    return this.bossService.getUserTransactions(userId, parsedLimit);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('admin/seasons')
  async adminListSeasons(@Query('limit') limit?: string) {
    return this.adminService.listSeasons(parseInt(limit ?? '12', 10) || 12);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('admin/seasons/:weekKey')
  async adminGetSeason(@Param('weekKey') weekKey: string) {
    return this.adminService.getSeason(weekKey);
  }

  /** Create/edit the config of a season that has not started yet (running and past seasons are locked). */
  /** Boss HP and coin rewards are money-adjacent: admin only (quiz.question.delete), like settle/reconcile. */
  @Permissions(...CONTENT_DELETE)
  @Put('admin/seasons/:weekKey')
  async adminUpsertSeason(
    @Param('weekKey') weekKey: string,
    @Body() dto: UpsertBossSeasonDto,
  ) {
    return this.adminService.upsertUpcomingSeason(weekKey, dto);
  }

  @Permissions(...CONTENT_DELETE)
  @Post('admin/settle')
  @HttpCode(HttpStatus.OK)
  async manualSettleWeek(@Body() dto: SettleWeekDto) {
    return this.bossService.settleWeek(dto.weekKey);
  }

  @Permissions(...CONTENT_DELETE)
  @Post('admin/reconcile')
  @HttpCode(HttpStatus.OK)
  async manualReconcile() {
    return this.reconciliationService.reconcilePendingTransactions();
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
