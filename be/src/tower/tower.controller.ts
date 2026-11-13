import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CONTENT_READ, CONTENT_UPDATE } from '../auth/quiz-permissions';
import { TowerService } from './tower.service';
import { TowerReconciliationService } from './coin/tower-reconciliation.service';
import { AnswerQuestionDto } from './dto/tower.dto';

@Controller('tower')
export class TowerController {
  constructor(
    private readonly towerService: TowerService,
    private readonly reconciliationService: TowerReconciliationService,
  ) {}

  @Permissions(...CONTENT_READ)
  @Get('overview')
  async getOverview(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.towerService.getOverview(userId);
  }

  @Permissions(...CONTENT_READ)
  @Post('floor/start')
  @HttpCode(HttpStatus.OK)
  async startFloor(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.towerService.startFloorAttempt(userId);
  }

  @Permissions(...CONTENT_READ)
  @Post('floor/answer')
  @HttpCode(HttpStatus.OK)
  async answerQuestion(
    @Request() req: ExpressRequest,
    @Body() dto: AnswerQuestionDto,
  ) {
    const userId = this.extractUserId(req);
    return this.towerService.answerFloorQuestion(userId, dto.optionLabel);
  }

  @Permissions(...CONTENT_READ)
  @Get('transactions')
  async getTransactions(
    @Request() req: ExpressRequest,
    @Query('limit') limit?: string,
  ) {
    const userId = this.extractUserId(req);
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100) : 50;
    return this.towerService.getUserTransactions(userId, parsedLimit);
  }

  @Permissions(...CONTENT_UPDATE)
  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  async triggerReconcile() {
    return this.reconciliationService.reconcilePendingAndUnknown();
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
