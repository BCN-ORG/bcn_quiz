import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  CONTENT_DELETE,
  CONTENT_READ,
  CONTENT_UPDATE,
} from '../auth/quiz-permissions';
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

  @Permissions(...CONTENT_UPDATE)
  @Get('admin/list')
  async listAdminGuilds() {
    return this.guildService.listAdminGuilds();
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('admin/:id')
  async getAdminGuildDetail(@Param('id') id: string) {
    return this.guildService.getAdminGuildDetail(id);
  }

  @Permissions(...CONTENT_UPDATE)
  @Patch('admin/:id')
  async updateAdminGuild(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      tag?: string;
      description?: string;
      maxMembers?: number;
    },
  ) {
    return this.guildService.updateAdminGuild(id, body ?? {});
  }

  @Permissions(...CONTENT_DELETE)
  @Delete('admin/:id/members/:userId')
  async kickAdminMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.guildService.kickAdminMember(id, userId);
  }

  @Permissions(...CONTENT_DELETE)
  @Delete('admin/:id')
  async deleteAdminGuild(@Param('id') id: string) {
    return this.guildService.deleteAdminGuild(id);
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
