import { BadRequestException } from '@nestjs/common';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';
import { CoinApiClient } from './coin-api.client';

describe('CoinApiClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      COIN_PROVIDER: 'live',
      COIN_API_BASE_URL: 'https://coin.example.test/api/v1',
      BCN_COIN_API_KEY: 'a'.repeat(32),
      COIN_TREASURY_DISCORD_ID: '222222222222222222',
      COIN_API_TIMEOUT_MS: '5000',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('validates required env vars onModuleInit when COIN_PROVIDER=live', () => {
    const client = new CoinApiClient({} as any);
    expect(() => client.onModuleInit()).not.toThrow();

    process.env.BCN_COIN_API_KEY = 'short';
    expect(() => client.onModuleInit()).toThrow(/BCN_COIN_API_KEY/);
  });

  it('validates idempotencyKey format and metadata size', () => {
    const client = new CoinApiClient({} as any);
    expect(() => client.validateIdempotencyKey('bad key with spaces')).toThrow(
      BadRequestException,
    );
    expect(
      client.validateIdempotencyKey(
        'bcn-reward-tower:s1:f7_966153253400231988',
      ),
    ).toBe('bcn-reward-tower:s1:f7_966153253400231988');

    expect(() => client.validateMetadata({ big: 'x'.repeat(2100) })).toThrow(
      BadRequestException,
    );
  });

  it('classifies 422 REWARD_POOL_INSUFFICIENT as FAILED and 503/409/timeout appropriately', async () => {
    const axiosErr = (status?: number, errorCode?: string, code?: string) => {
      const err = new AxiosError('err', code);
      if (status) {
        err.response = {
          status,
          statusText: 'Err',
          headers: {},
          config: { headers: new AxiosHeaders() },
          data: { success: false, errorCode, message: 'msg' },
        };
      }
      return err;
    };

    const http = {
      post: jest
        .fn()
        .mockReturnValueOnce(
          throwError(() => axiosErr(422, 'REWARD_POOL_INSUFFICIENT')),
        )
        .mockReturnValueOnce(
          throwError(() => axiosErr(409, 'TRANSACTION_IN_PROGRESS')),
        )
        .mockReturnValueOnce(
          throwError(() => axiosErr(503, 'REWARD_POOL_NOT_CONFIGURED')),
        )
        .mockReturnValueOnce(
          throwError(() => axiosErr(undefined, undefined, 'ETIMEDOUT')),
        ),
    };
    const client = new CoinApiClient(http as any);

    const poolFail = await client.reward({
      userId: '966153253400231988',
      amount: 1,
      idempotencyKey: 'k1',
      source: 'TOWER_COMPLETION',
      description: 'Tower 1',
    });
    expect(poolFail.outcome).toBe('FAILED');
    expect(poolFail.errorCode).toBe('REWARD_POOL_INSUFFICIENT');

    const pending = await client.reward({
      userId: '966153253400231988',
      amount: 1,
      idempotencyKey: 'k2',
      source: 'TOWER_COMPLETION',
      description: 'Tower 2',
    });
    expect(pending.outcome).toBe('PENDING');

    const unavailable = await client.reward({
      userId: '966153253400231988',
      amount: 1,
      idempotencyKey: 'k3',
      source: 'TOWER_COMPLETION',
      description: 'Tower 3',
    });
    expect(unavailable.outcome).toBe('UNKNOWN');

    const timeout = await client.reward({
      userId: '966153253400231988',
      amount: 1,
      idempotencyKey: 'k4',
      source: 'TOWER_COMPLETION',
      description: 'Tower 4',
    });
    expect(timeout.outcome).toBe('UNKNOWN');
    expect(timeout.errorCode).toBe('TIMEOUT_OR_NETWORK');
  });

  it('sends Bearer auth and Idempotency-Key on reward', async () => {
    const http = {
      post: jest.fn().mockReturnValue(
        of({
          status: 200,
          data: {
            success: true,
            data: {
              transactionId: 'coin_tx_1',
              userId: '966153253400231988',
              amount: 1,
              newBalance: 10,
              status: 'SUCCESS',
            },
          },
        }),
      ),
    };
    const client = new CoinApiClient(http as any);
    const res = await client.reward({
      userId: '966153253400231988',
      amount: 1,
      idempotencyKey: 'k-ok',
      source: 'TOWER_COMPLETION',
      description: 'Tower 1',
    });

    expect(res.ok).toBe(true);
    expect(res.data?.transactionId).toBe('coin_tx_1');
    expect(http.post).toHaveBeenCalledWith(
      'https://coin.example.test/api/v1/coins/reward',
      expect.objectContaining({ userId: '966153253400231988', amount: 1 }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${'a'.repeat(32)}`,
          'Idempotency-Key': 'k-ok',
        }),
      }),
    );
  });
});
