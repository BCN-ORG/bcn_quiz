import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CONTENT_UPDATE } from '../auth/quiz-permissions';
import { BountyService } from './bounty.service';
import { CreateBountyDto, ReviewBountyDto } from './dto/bounty.dto';
import { BountyAssignmentStatus, BountyStatus } from '@prisma/client';

@Controller('admin/bounties')
export class BountyAdminController {
  constructor(private readonly bountyService: BountyService) {}

  @Permissions(...CONTENT_UPDATE)
  @Get()
  async listAllBounties(@Query('status') status?: BountyStatus) {
    return this.bountyService.listAllBounties(status);
  }

  @Permissions(...CONTENT_UPDATE)
  @Post()
  async createBounty(@Body() dto: CreateBountyDto) {
    return this.bountyService.createBounty(dto);
  }

  @Permissions(...CONTENT_UPDATE)
  @Put(':id')
  async updateBounty(
    @Param('id') id: string,
    @Body() dto: Partial<CreateBountyDto>,
  ) {
    return this.bountyService.updateBounty(id, dto);
  }

  @Permissions(...CONTENT_UPDATE)
  @Delete(':id')
  async deleteBounty(@Param('id') id: string) {
    return this.bountyService.deleteBounty(id);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('submissions')
  async listSubmissions(@Query('status') status?: BountyAssignmentStatus) {
    return this.bountyService.listSubmissions(status);
  }

  @Permissions(...CONTENT_UPDATE)
  @Post('submissions/:id/review')
  @HttpCode(HttpStatus.OK)
  async reviewSubmission(
    @Request() req: ExpressRequest,
    @Param('id') id: string,
    @Body() dto: ReviewBountyDto,
  ) {
    const reviewerId = this.extractUserId(req);
    return this.bountyService.reviewSubmission(
      id,
      reviewerId,
      dto.status,
      dto.feedback,
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

    for (const c of candidates) {
      if (typeof c === 'string' && c.length > 0) return c;
    }
    return 'admin';
  }
}
