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

@Controller('leaderboards/topics')
export class LeaderboardController {
  constructor(private readonly service: LeaderboardService) {}

  @Permissions(...CONTENT_READ)
  @Get(':topicId/daily')
  daily(
    @Param('topicId') topicId: string,
    @Query() query: LeaderboardQueryDto,
    @Request() req: ExpressRequest,
  ) {
    return this.service.list(topicId, 'daily', query, req);
  }

  @Permissions(...CONTENT_READ)
  @Get(':topicId/weekly')
  weekly(
    @Param('topicId') topicId: string,
    @Query() query: LeaderboardQueryDto,
    @Request() req: ExpressRequest,
  ) {
    return this.service.list(topicId, 'weekly', query, req);
  }
}

@Controller('admin/leaderboards/topics')
export class AdminLeaderboardController {
  constructor(private readonly service: LeaderboardService) {}

  @Permissions(...CONTENT_UPDATE)
  @Get(':topicId/daily')
  daily(
    @Param('topicId') topicId: string,
    @Query() query: LeaderboardQueryDto,
    @Request() req: ExpressRequest,
  ) {
    return this.service.list(topicId, 'daily', query, req, true);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get(':topicId/weekly')
  weekly(
    @Param('topicId') topicId: string,
    @Query() query: LeaderboardQueryDto,
    @Request() req: ExpressRequest,
  ) {
    return this.service.list(topicId, 'weekly', query, req, true);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get(':topicId/daily/export')
  async exportDaily(
    @Param('topicId') topicId: string,
    @Query() query: LeaderboardQueryDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    return this.exportFile(topicId, 'daily', query, res);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get(':topicId/weekly/export')
  async exportWeekly(
    @Param('topicId') topicId: string,
    @Query() query: LeaderboardQueryDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    return this.exportFile(topicId, 'weekly', query, res);
  }

  private async exportFile(
    topicId: string,
    mode: 'daily' | 'weekly',
    query: LeaderboardQueryDto,
    res: ExpressResponse,
  ) {
    if (query.format && query.format !== 'xlsx')
      throw new BadRequestException('Only xlsx format is supported');
    const { buffer, filename } = await this.service.export(
      topicId,
      mode,
      mode === 'daily' ? query.date : query.weekStart,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(buffer);
  }
}
