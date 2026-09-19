import { AuthTokenCache } from './auth-token.cache';
import type { RedisService } from '../redis/redis.service';

function createRedisMock() {
  const store = new Map<string, string>();
  return {
    store,
    redis: {
      key: (suffix: string) => `bcn:quiz:${suffix}`,
      get: jest.fn(async (key: string) => store.get(`bcn:quiz:${key}`) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        store.set(`bcn:quiz:${key}`, value);
      }),
      getJson: jest.fn(async (key: string) => {
        const raw = store.get(`bcn:quiz:${key}`);
        return raw == null ? undefined : JSON.parse(raw);
      }),
      setJson: jest.fn(async (key: string, value: unknown) => {
        store.set(`bcn:quiz:${key}`, JSON.stringify(value));
      }),
      del: jest.fn(async (...keys: string[]) => {
        let n = 0;
        for (const key of keys) {
          if (store.delete(`bcn:quiz:${key}`)) n += 1;
        }
        return n;
      }),
      delByPrefix: jest.fn(async (prefix: string) => {
        const full = `bcn:quiz:${prefix}`;
        let n = 0;
        for (const key of [...store.keys()]) {
          if (key.startsWith(full)) {
            store.delete(key);
            n += 1;
          }
        }
        return n;
      }),
    } as unknown as RedisService,
  };
}

describe('AuthTokenCache', () => {
  it('returns cached values within TTL', async () => {
    const { redis } = createRedisMock();
    const cache = new AuthTokenCache<string>(redis, 60_000);
    const loader = jest.fn(async () => 'user');

    await expect(cache.getOrLoad('k1', loader)).resolves.toBe('user');
    await expect(cache.getOrLoad('k1', loader)).resolves.toBe('user');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent loads for the same key', async () => {
    const { redis } = createRedisMock();
    const cache = new AuthTokenCache<string>(redis, 60_000);
    let resolveLoader!: (value: string) => void;
    const loader = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoader = resolve;
        }),
    );

    const first = cache.getOrLoad('same', loader);
    const second = cache.getOrLoad('same', loader);

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(loader).toHaveBeenCalledTimes(1);
    resolveLoader('ok');

    await expect(Promise.all([first, second])).resolves.toEqual(['ok', 'ok']);
  });

  it('deletes cached entries', async () => {
    const { redis } = createRedisMock();
    const cache = new AuthTokenCache<string>(redis, 60_000);
    await cache.set('a', '1');
    await cache.delete('a');
    await expect(cache.get('a')).resolves.toBeUndefined();
  });

  it('hashes credentials stably', () => {
    const a = AuthTokenCache.hashCredentials(['Bearer t', 'a=1']);
    const b = AuthTokenCache.hashCredentials(['Bearer t', 'a=1']);
    const c = AuthTokenCache.hashCredentials(['Bearer other', 'a=1']);

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
