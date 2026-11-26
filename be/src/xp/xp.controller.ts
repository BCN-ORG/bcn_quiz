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
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CONTENT_READ } from '../auth/quiz-permissions';
import { XpService } from './xp.service';

@Controller('xp')
export class XpController {
  constructor(private readonly xpService: XpService) {}

  @Permissions(...CONTENT_READ)
  @Get('me')
  async getMe(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    const email = this.extractUserEmail(req);
    return email
      ? this.xpService.getSummary(userId, email)
      : this.xpService.getSummary(userId);
  }

  @Permissions(...CONTENT_READ)
  @Put('me/cosmetics')
  async updateCosmetics(
    @Request() req: ExpressRequest,
    @Body()
    body: {
      equippedTierId?: string | null;
      equippedCharacterId?: string | null;
      equippedBannerId?: string | null;
      equippedFrameId?: string | null;
      equippedNameplateId?: string | null;
      pinnedBadges?: string[];
    },
  ) {
    const email = this.extractUserEmail(req);
    return this.xpService.updateCosmetics(
      this.extractUserId(req),
      {
        ...(body && 'equippedTierId' in body
          ? { equippedTierId: body.equippedTierId ?? null }
          : {}),
        ...(body && 'equippedCharacterId' in body
          ? { equippedCharacterId: body.equippedCharacterId ?? null }
          : {}),
        ...(body && 'equippedBannerId' in body
          ? { equippedBannerId: body.equippedBannerId ?? null }
          : {}),
        ...(body && 'equippedFrameId' in body
          ? { equippedFrameId: body.equippedFrameId ?? null }
          : {}),
        ...(body && 'equippedNameplateId' in body
          ? { equippedNameplateId: body.equippedNameplateId ?? null }
          : {}),
        ...(body && Array.isArray(body.pinnedBadges)
          ? { pinnedBadges: body.pinnedBadges }
          : {}),
      },
      email,
    );
  }

  @Permissions(...CONTENT_READ)
  @Post('cosmetics/purchase')
  @HttpCode(HttpStatus.OK)
  async purchaseCosmetic(
    @Request() req: ExpressRequest,
    @Body() body: { cosmeticId?: string },
  ) {
    return this.xpService.purchaseCosmetic(
      this.extractUserId(req),
      body?.cosmeticId ?? '',
    );
  }

  @Permissions(...CONTENT_READ)
  @Get('players/:userId/profile')
  async getPlayerProfile(@Param('userId') targetUserId: string) {
    return this.xpService.getPlayerProfile(targetUserId);
  }

  @Permissions(...CONTENT_READ)
  @Post('daily-chest/claim')
  @HttpCode(HttpStatus.OK)
  async claimDailyChest(@Request() req: ExpressRequest) {
    return this.xpService.claimDailyChest(this.extractUserId(req));
  }

  private extractUserEmail(req: ExpressRequest): string | undefined {
    const user = (
      req as ExpressRequest & {
        user?: {
          email?: unknown;
          user?: { email?: unknown };
          data?: { email?: unknown; user?: { email?: unknown } };
        };
      }
    ).user;
    return [
      user?.email,
      user?.user?.email,
      user?.data?.email,
      user?.data?.user?.email,
    ].find((v): v is string => typeof v === 'string' && v.trim().length > 0);
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
    const userId = [
      user?.id,
      user?.sub,
      user?.user?.id,
      user?.data?.id,
      user?.data?.user?.id,
    ].find((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (!userId) {
      throw new ForbiddenException('Unable to resolve authenticated user id');
    }
    return userId;
  }
}
