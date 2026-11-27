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
  Sse,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CONTENT_READ } from '../auth/quiz-permissions';
import { PvpService } from './pvp.service';

@Controller('pvp')
export class PvpController {
  constructor(private readonly pvpService: PvpService) {}

  @Permissions(...CONTENT_READ)
  @Get('rating/me')
  async getMyRating(@Request() req: ExpressRequest) {
    return this.pvpService.getMyRating(this.extractUserId(req));
  }

  @Permissions(...CONTENT_READ)
  @Get('leaderboard')
  async getLeaderboard() {
    return this.pvpService.getLeaderboard();
  }

  @Permissions(...CONTENT_READ)
  @Post('matches/create')
  async createMatch(
    @Request() req: ExpressRequest,
    @Body() body: { topicId?: string },
  ) {
    return this.pvpService.createMatch(this.extractUserId(req), body?.topicId);
  }

  @Permissions(...CONTENT_READ)
  @Post('matches/join/:code')
  @HttpCode(HttpStatus.OK)
  async joinMatch(@Request() req: ExpressRequest, @Param('code') code: string) {
    return this.pvpService.joinByCode(this.extractUserId(req), code);
  }

  @Permissions(...CONTENT_READ)
  @Get('matches/:id')
  async getMatch(@Request() req: ExpressRequest, @Param('id') id: string) {
    return this.pvpService.getMatchDetail(id, this.extractUserId(req));
  }

  @Permissions(...CONTENT_READ)
  @Sse('matches/:id/stream')
  streamMatch(@Request() req: ExpressRequest, @Param('id') id: string) {
    return this.pvpService.streamMatch(id, this.extractUserId(req));
  }

  @Permissions(...CONTENT_READ)
  @Post('matches/:id/answer')
  @HttpCode(HttpStatus.OK)
  async submitAnswer(
    @Request() req: ExpressRequest,
    @Param('id') id: string,
    @Body()
    body: {
      questionIndex: number;
      selectedAnswer: string;
      responseMs?: number;
    },
  ) {
    return this.pvpService.submitAnswer(id, this.extractUserId(req), body);
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
