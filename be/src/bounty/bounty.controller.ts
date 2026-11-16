import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CONTENT_READ } from '../auth/quiz-permissions';
import { BountyService } from './bounty.service';
import { QueryBountiesDto, SubmitBountyDto } from './dto/bounty.dto';

@Controller('bounties')
export class BountyController {
  constructor(private readonly bountyService: BountyService) {}

  @Permissions(...CONTENT_READ)
  @Get()
  async listBounties(
    @Request() req: ExpressRequest,
    @Query() query: QueryBountiesDto,
  ) {
    const userId = this.extractUserId(req);
    return this.bountyService.listBounties(userId, query);
  }

  @Permissions(...CONTENT_READ)
  @Get('active')
  async getActiveBounty(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.bountyService.getActiveBounty(userId);
  }

  @Permissions(...CONTENT_READ)
  @Get('stats')
  async getStats(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.bountyService.getStats(userId);
  }

  @Permissions(...CONTENT_READ)
  @Get('history')
  async getHistory(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.bountyService.getHistory(userId);
  }

  @Permissions(...CONTENT_READ)
  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  async acceptBounty(@Request() req: ExpressRequest, @Param('id') id: string) {
    const userId = this.extractUserId(req);
    return this.bountyService.acceptBounty(userId, id);
  }

  @Permissions(...CONTENT_READ)
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  async submitBounty(
    @Request() req: ExpressRequest,
    @Param('id') id: string,
    @Body() dto: SubmitBountyDto,
  ) {
    const userId = this.extractUserId(req);
    return this.bountyService.submitBounty(userId, id, dto);
  }

  @Permissions(...CONTENT_READ)
  @Post(':id/abandon')
  @HttpCode(HttpStatus.OK)
  async abandonBounty(@Request() req: ExpressRequest, @Param('id') id: string) {
    const userId = this.extractUserId(req);
    return this.bountyService.abandonBounty(userId, id);
  }

  @Permissions(...CONTENT_READ)
  @Post('assignments/:id/claim')
  @HttpCode(HttpStatus.OK)
  async claimReward(@Request() req: ExpressRequest, @Param('id') id: string) {
    const userId = this.extractUserId(req);
    return this.bountyService.claimReward(userId, id);
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
      if (typeof c === 'string' && c.length > 0) return c;
    }
    throw new UnauthorizedException(
      'Vui lòng đăng nhập để thực hiện thao tác.',
    );
  }
}
