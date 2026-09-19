import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createRedisClient, resolveRedisMode } from './redis.factory';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;
  private readonly prefix: string;

  constructor(private readonly config: ConfigService) {
    this.prefix =
      this.config.get<string>('REDIS_PREFIX')?.trim() ||
      this.config.get<string>('REDIS_KEY_PREFIX')?.trim() ||
      'bcn:quiz:';
  }

  async onModuleInit(): Promise<void> {
    const mode = resolveRedisMode(this.config);
    if (
      mode === 'standalone' &&
      !this.config.get<string>('REDIS_URL')?.trim() &&
      !this.config.get<string>('REDIS_HOST')?.trim()
    ) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new Error('REDIS_URL environment variable is required');
      }
      this.logger.warn(
        'REDIS_URL is not set; defaulting to redis://localhost:6379',
      );
    }

    this.client = createRedisClient(this.config);
    this.client.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`);
    });

    await this.client.connect();
    const pong = await this.client.ping();
    this.logger.log(
      `Redis connected (${pong}), mode=${mode}, prefix=${this.prefix}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  key(suffix: string): string {
    const clean = suffix.replace(/^:+/, '');
    return `${this.prefix}${clean}`;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(this.key(key));
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    const full = this.key(key);
    if (ttlMs !== undefined && ttlMs > 0) {
      await this.client.set(full, value, 'PX', ttlMs);
      return;
    }
    await this.client.set(full, value);
  }

  async getJson<T>(key: string): Promise<T | undefined> {
    const raw = await this.get(key);
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async setJson(key: string, value: unknown, ttlMs?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlMs);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(...keys.map((k) => this.key(k)));
  }

  async delByPrefix(relativePrefix: string): Promise<number> {
    const match = `${this.key(relativePrefix)}*`;
    let cursor = '0';
    let removed = 0;

    do {
      const [next, keys] = await this.client.scan(
        cursor,
        'MATCH',
        match,
        'COUNT',
        100,
      );
      cursor = next;
      if (keys.length > 0) {
        removed += await this.client.del(...keys);
      }
    } while (cursor !== '0');

    return removed;
  }

  get raw(): Redis {
    return this.client;
  }
}
