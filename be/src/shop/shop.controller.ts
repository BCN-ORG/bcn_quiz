import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
} from '@nestjs/common';
import { ConsumableType } from '@prisma/client';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CONTENT_READ, CONTENT_UPDATE } from '../auth/quiz-permissions';
import { ShopService } from './shop.service';

@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Permissions(...CONTENT_READ)
  @Get('inventory')
  async getInventory(@Request() req: ExpressRequest) {
    return this.shopService.getInventory(this.extractUserId(req));
  }

  @Permissions(...CONTENT_READ)
  @Post('consumables/purchase')
  @HttpCode(HttpStatus.OK)
  async purchaseConsumable(
    @Request() req: ExpressRequest,
    @Body() body: { itemType?: ConsumableType; idempotencyKey?: string },
  ) {
    return this.shopService.purchaseConsumable(
      this.extractUserId(req),
      body?.itemType as ConsumableType,
      body?.idempotencyKey,
    );
  }

  @Permissions(...CONTENT_READ)
  @Post('mystery-chest/open')
  @HttpCode(HttpStatus.OK)
  async openMysteryChest(
    @Request() req: ExpressRequest,
    @Body() body: { idempotencyKey?: string },
  ) {
    return this.shopService.openMysteryChest(
      this.extractUserId(req),
      body?.idempotencyKey,
    );
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('admin/overview')
  async getAdminOverview() {
    return this.shopService.getAdminOverview();
  }

  @Permissions(...CONTENT_UPDATE)
  @Post('admin/grant-consumable')
  @HttpCode(HttpStatus.OK)
  async grantAdminConsumable(
    @Body()
    body: {
      userId?: string;
      itemType?: ConsumableType;
      amount?: number;
    },
  ) {
    return this.shopService.grantAdminConsumable({
      userId: body?.userId ?? '',
      itemType: body?.itemType as ConsumableType,
      amount: body?.amount,
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
