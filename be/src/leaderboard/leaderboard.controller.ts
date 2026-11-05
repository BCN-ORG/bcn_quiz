import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Request,
  Response,
  StreamableFile,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CONTENT_READ, CONTENT_UPDATE } from '../auth/quiz-permissions';
import { LeaderboardService } from './leaderboard.service';

export class LeaderboardQueryDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() weekStart?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() format?: string;
}

@Controller('leaderboards')
export class LeaderboardController {
  constructor(private readonly service: LeaderboardService) {}

  @Permissions(...CONTENT_READ)
  @Get('topics/:topicId/daily')
  daily(
    @Param('topicId') topicId: string,
    @Query() query: LeaderboardQueryDto,
    @Request() req: ExpressRequest,
  ) {
    return this.service.list(topicId, 'daily', query, req);
  }

  /** The overall weekly board (all topics together). */
  @Permissions(...CONTENT_READ)
  @Get('weekly')
  weekly(@Query() query: LeaderboardQueryDto, @Request() req: ExpressRequest) {
    return this.service.listWeekly(query, req);
  }
}

@Controller('admin/leaderboards')
export class AdminLeaderboardController {
  constructor(private readonly service: LeaderboardService) {}

  @Permissions(...CONTENT_UPDATE)
  @Get('topics/:topicId/daily')
  daily(
    @Param('topicId') topicId: string,
    @Query() query: LeaderboardQueryDto,
    @Request() req: ExpressRequest,
  ) {
    return this.service.list(topicId, 'daily', query, req, true);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('weekly')
  weekly(@Query() query: LeaderboardQueryDto, @Request() req: ExpressRequest) {
    return this.service.listWeekly(query, req, true);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('topics/:topicId/daily/export')
  async exportDaily(
    @Param('topicId') topicId: string,
    @Query() query: LeaderboardQueryDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    this.assertXlsx(query);
    return this.file(await this.service.exportDaily(topicId, query.date), res);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('weekly/export')
  async exportWeekly(
    @Query() query: LeaderboardQueryDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    this.assertXlsx(query);
    return this.file(await this.service.exportWeekly(query.weekStart), res);
  }

  private assertXlsx(query: LeaderboardQueryDto) {
    if (query.format && query.format !== 'xlsx')
      throw new BadRequestException('Only xlsx format is supported');
  }

  private file(
    { buffer, filename }: { buffer: Buffer; filename: string },
    res: ExpressResponse,
  ) {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(buffer);
  }
}
