import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';

export type RedisClientMode = 'standalone' | 'sentinel';

/**
 * Build an ioredis client from env.
 *
 * Production: REDIS_HOST=redis + REDIS_PORT=6379 + shared password, DB 0.
 * Development: REDIS_URL (default redis://localhost:6379) or REDIS_HOST.
 * Sentinel: REDIS_SENTINELS=host1:26379,host2:26379 + REDIS_SENTINEL_NAME=mymaster
 * Optional: REDIS_PASSWORD, REDIS_SENTINEL_PASSWORD
 */
export function resolveRedisMode(config: ConfigService): RedisClientMode {
  const sentinels = config.get<string>('REDIS_SENTINELS')?.trim();
  const name = config.get<string>('REDIS_SENTINEL_NAME')?.trim();
  if (sentinels && name) {
    return 'sentinel';
  }
  return 'standalone';
}

export function createRedisClient(
  config: ConfigService,
  extras: RedisOptions = {},
): Redis {
  const isProd = config.get<string>('NODE_ENV') === 'production';
  const mode = resolveRedisMode(config);
  const password = config.get<string>('REDIS_PASSWORD') || undefined;

  const base: RedisOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    ...extras,
  };

  if (
    isProd &&
    (mode !== 'standalone' ||
      config.get<string>('REDIS_HOST') !== 'redis' ||
      config.get<string>('REDIS_PORT') !== '6379' ||
      !password)
  ) {
    throw new Error(
      'Production Redis requires redis:6379, database 0 and the shared password',
    );
  }

  if (mode === 'sentinel') {
    const sentinelName = config.get<string>('REDIS_SENTINEL_NAME')!.trim();
    const sentinels = config
      .get<string>('REDIS_SENTINELS')!
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((entry) => {
        const [host, portRaw] = entry.split(':');
        return {
          host: host.trim(),
          port: Number(portRaw || 26379),
        };
      });

    if (sentinels.length === 0) {
      throw new Error('REDIS_SENTINELS must list at least one host:port');
    }

    return new Redis({
      ...base,
      sentinels,
      name: sentinelName,
      password,
      sentinelPassword:
        config.get<string>('REDIS_SENTINEL_PASSWORD')?.trim() || undefined,
    });
  }

  const host = config.get<string>('REDIS_HOST')?.trim();
  if (host) {
    return new Redis({
      ...base,
      host,
      port: Number(config.get<string>('REDIS_PORT') || 6379),
      password,
      db: 0,
    });
  }

  const url = config.get<string>('REDIS_URL')?.trim();
  if (!url) {
    if (isProd) {
      throw new Error(
        'REDIS_URL (or REDIS_SENTINELS + REDIS_SENTINEL_NAME) is required',
      );
    }
  }

  return new Redis(url || 'redis://localhost:6379', {
    ...base,
    ...(password ? { password } : {}),
  });
}
