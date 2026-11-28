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
import { MistakeService } from './mistake.service';

@Controller('mistakes')
export class MistakeController {
  constructor(private readonly mistakeService: MistakeService) {}

  @Permissions(...CONTENT_READ)
  @Get('summary')
  async getSummary(@Request() req: ExpressRequest) {
    return this.mistakeService.getSummary(this.extractUserId(req));
  }

  @Permissions(...CONTENT_READ)
  @Get('practice')
  async getPractice(
    @Request() req: ExpressRequest,
    @Query('limit') limit?: string,
    @Query('topicId') topicId?: string,
  ) {
    return this.mistakeService.getPracticeQueue(
      this.extractUserId(req),
      limit ? Number(limit) : 10,
      topicId,
    );
  }

  @Permissions(...CONTENT_READ)
  @Post('submit')
  @HttpCode(HttpStatus.OK)
  async submitReview(
    @Request() req: ExpressRequest,
    @Body()
    body: { answers?: Array<{ quizId: string; selectedAnswer: string }> },
  ) {
    return this.mistakeService.submitReview(
      this.extractUserId(req),
      body?.answers ?? [],
    );
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('admin/analytics')
  async getAdminAnalytics() {
    return this.mistakeService.getAdminAnalytics();
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
