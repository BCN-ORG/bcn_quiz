import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Permissions } from './auth/decorators/permissions.decorator';
import { CONTENT_DELETE } from './auth/quiz-permissions';
import { Public } from './auth/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  async getHealth(): Promise<{ status: 'UP' }> {
    await Promise.all([
      this.prisma.$queryRawUnsafe('SELECT 1'),
      this.redis.raw.ping(),
    ]);
    return { status: 'UP' };
  }

  @Get('admin')
  @Permissions(...CONTENT_DELETE)
  getAdminArea() {
    return {
      message: 'Admin resource granted',
    };
  }
}
