import { createHash } from 'node:crypto';
import type { RedisService } from '../redis/redis.service';

/**
 * Redis TTL cache with in-process in-flight request coalescing.
 * Used to avoid calling Profiles /me on every protected request.
 */
export class AuthTokenCache<T> {
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly redis: RedisService,
    private readonly ttlMs: number,
  ) {}

  static hashCredentials(parts: Array<string | undefined>): string {
    const material = parts.map((part) => part?.trim() ?? '').join('\0');

    return createHash('sha256').update(material).digest('hex');
  }

  private redisKey(key: string): string {
    return `auth:me:${key}`;
  }

  async get(key: string): Promise<T | undefined> {
    if (this.ttlMs <= 0) {
      return undefined;
    }
    return this.redis.getJson<T>(this.redisKey(key));
  }

  async set(key: string, value: T): Promise<void> {
    if (this.ttlMs <= 0) {
      return;
    }
    await this.redis.setJson(this.redisKey(key), value, this.ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.redisKey(key));
  }

  async clear(): Promise<void> {
    this.inflight.clear();
    await this.redis.delByPrefix('auth:me:');
  }

  async getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
    const pending = this.inflight.get(key);
    if (pending) {
      return pending;
    }

    const promise = (async () => {
      const cached = await this.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const value = await loader();
      await this.set(key, value);
      return value;
    })().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }
}
