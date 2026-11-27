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
import { GuildService } from './guild.service';

@Controller('guilds')
export class GuildController {
  constructor(private readonly guildService: GuildService) {}

  @Permissions(...CONTENT_READ)
  @Get()
  async listGuilds() {
    return this.guildService.listGuilds();
  }

  @Permissions(...CONTENT_READ)
  @Get('me')
  async getMyGuild(@Request() req: ExpressRequest) {
    return this.guildService.getMyGuild(this.extractUserId(req));
  }

  @Permissions(...CONTENT_READ)
  @Get('leaderboard')
  async getBossLeaderboard() {
    return this.guildService.getGuildBossLeaderboard();
  }

  @Permissions(...CONTENT_READ)
  @Post()
  async createGuild(
    @Request() req: ExpressRequest,
    @Body() body: { name?: string; tag?: string; description?: string },
  ) {
    return this.guildService.createGuild(this.extractUserId(req), {
      name: body?.name ?? '',
      tag: body?.tag ?? '',
      description: body?.description,
    });
  }

  @Permissions(...CONTENT_READ)
  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  async joinGuild(@Request() req: ExpressRequest, @Param('id') id: string) {
    return this.guildService.joinGuild(this.extractUserId(req), id);
  }

  @Permissions(...CONTENT_READ)
  @Post('leave')
  @HttpCode(HttpStatus.OK)
  async leaveGuild(@Request() req: ExpressRequest) {
    return this.guildService.leaveGuild(this.extractUserId(req));
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
