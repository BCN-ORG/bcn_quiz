import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createRedisClient, resolveRedisMode } from './redis.factory';

jest.mock('ioredis', () => jest.fn());

function config(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as ConfigService;
}

describe('shared Redis configuration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses database 0 and preserves the password for both app and throttler clients', () => {
    const settings = config({
      NODE_ENV: 'production',
      REDIS_HOST: 'redis',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: ' password$ ',
    });
    createRedisClient(settings, {
      keyPrefix: 'profiles:throttler:',
      lazyConnect: false,
    });
    expect(Redis).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'redis',
        port: 6379,
        db: 0,
        password: ' password$ ',
        keyPrefix: 'profiles:throttler:',
        lazyConnect: false,
      }),
    );
  });

  it('rejects production connection outside shared infrastructure', () => {
    expect(() =>
      createRedisClient(
        config({
          NODE_ENV: 'production',
          REDIS_HOST: 'localhost',
          REDIS_PORT: '6379',
          REDIS_PASSWORD: 'password',
        }),
      ),
    ).toThrow('Production Redis requires');
  });

  it('keeps legacy standalone and Sentinel configuration available in development', () => {
    createRedisClient(config({ REDIS_URL: 'redis://localhost:6379' }));
    expect(Redis).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.any(Object),
    );
    expect(
      resolveRedisMode(
        config({
          REDIS_SENTINELS: 'localhost:26379',
          REDIS_SENTINEL_NAME: 'mymaster',
        }),
      ),
    ).toBe('sentinel');
    expect(resolveRedisMode(config({}))).toBe('standalone');
  });
});
