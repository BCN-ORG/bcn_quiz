import {
  Controller,
  Get,
  UnauthorizedException,
  Param,
  Patch,
  Query,
  Request,
  Sse,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Request as ExpressRequest } from 'express';
import { NotificationRealtimeService } from './notification-realtime.service';
import { NotificationService } from './notification.service';

class NotificationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unreadOnly?: boolean;
}

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly service: NotificationService,
    private readonly realtime: NotificationRealtimeService,
  ) {}

  @Get()
  list(@Request() req: ExpressRequest, @Query() query: NotificationQueryDto) {
    return this.service.list(
      this.userId(req),
      query.page ?? 1,
      query.limit ?? 20,
      query.unreadOnly ?? false,
    );
  }

  @Get('unread-count')
  unreadCount(@Request() req: ExpressRequest) {
    return this.service.unreadCount(this.userId(req));
  }

  @Sse('stream')
  stream(@Request() req: ExpressRequest) {
    return this.realtime.subscribe(this.userId(req));
  }

  @Patch('read-all')
  markAllRead(@Request() req: ExpressRequest) {
    return this.service.markAllRead(this.userId(req));
  }

  @Patch(':id/read')
  markRead(@Request() req: ExpressRequest, @Param('id') id: string) {
    return this.service.markRead(this.userId(req), id);
  }

  private userId(req: ExpressRequest): string {
    const user = (req as ExpressRequest & { user?: { id?: string } }).user;
    if (!user?.id)
      throw new UnauthorizedException('Authenticated user not found');
    return user.id;
  }
}
