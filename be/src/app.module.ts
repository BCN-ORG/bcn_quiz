import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { QuizModule } from './quiz/quiz.module';
import { TopicModule } from './topic/topic.module';
import { AttemptModule } from './attempt/attempt.module';
import { BearerAuthGuard } from './auth/guards/auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CourseModule } from './course/course.module';
import { CertificateModule } from './certificate/certificate.module';
import { HttpExceptionEnvelopeFilter } from './common/filters/http-exception-envelope.filter';
import { RequestLoggingMiddleware } from './common/logging/request-logging.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { createRedisClient } from './redis/redis.factory';
import { RedisModule } from './redis/redis.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { NotificationModule } from './notification/notification.module';
import { TowerModule } from './tower/tower.module';
import { BossModule } from './boss/boss.module';
import { XpModule } from './xp/xp.module';

/** Env value only when it is a finite number above 0 (a blank `KEY=` would otherwise become 0 = block everything). */
function positiveNumber(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  return raw !== undefined &&
    raw !== '' &&
    Number.isFinite(parsed) &&
    parsed > 0
    ? parsed
    : fallback;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const prefix =
          config.get<string>('REDIS_PREFIX')?.trim() ||
          config.get<string>('REDIS_KEY_PREFIX')?.trim() ||
          'bcn:quiz:';
        const redis = createRedisClient(config, {
          keyPrefix: `${prefix}throttler:`,
          lazyConnect: false,
        });
        const isDev = config.get<string>('NODE_ENV') === 'development';
        const defaultLimit = isDev ? 1000 : 300;
        return {
          throttlers: [
            {
              ttl: positiveNumber(config.get('THROTTLE_TTL_MS'), 60_000),
              limit: positiveNumber(config.get('THROTTLE_LIMIT'), defaultLimit),
            },
          ],
          storage: new ThrottlerStorageRedisService(redis),
        };
      },
    }),
    ScheduleModule.forRoot(),
    RedisModule,
    PrismaModule,
    AuthModule,
    QuizModule,
    TopicModule,
    AttemptModule,
    CourseModule,
    CertificateModule,
    LeaderboardModule,
    NotificationModule,
    TowerModule,
    BossModule,
    XpModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RequestLoggingMiddleware,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionEnvelopeFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: BearerAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
