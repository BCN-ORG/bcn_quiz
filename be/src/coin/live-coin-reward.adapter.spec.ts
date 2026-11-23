import { CoinRewardSource } from '@prisma/client';
import { LiveCoinRewardAdapter } from './live-coin-reward.adapter';

describe('LiveCoinRewardAdapter', () => {
  function setup(overrides?: {
    rewardsEnabled?: boolean;
    discordId?: string | null;
    clamped?: number;
  }) {
    const coinApiClient = {
      validateIdempotencyKey: jest.fn((k: string) => k),
      sanitizeDescription: jest.fn((d: string | undefined, fb: string) =>
        (d ?? fb).slice(0, 200),
      ),
      validateMetadata: jest.fn((m) => m),
      reward: jest.fn().mockResolvedValue({
        ok: true,
        outcome: 'SUCCESS',
        data: { transactionId: 'coin_tx_1', status: 'SUCCESS' },
      }),
      checkStatus: jest.fn().mockResolvedValue({
        ok: true,
        outcome: 'SUCCESS',
        data: { status: 'SUCCESS', transactionId: 'coin_tx_1' },
      }),
    };
    const coinConfigService = {
      getConfig: jest.fn().mockResolvedValue({
        rewardsEnabled: overrides?.rewardsEnabled ?? true,
      }),
      clampRewardAmount: jest.fn().mockResolvedValue(overrides?.clamped ?? 5),
    };
    const profilesService = {
      resolveDiscordId: jest
        .fn()
        .mockResolvedValue(
          overrides?.discordId !== undefined
            ? overrides.discordId
            : '966153253400231988',
        ),
    };
    return {
      adapter: new LiveCoinRewardAdapter(
        coinApiClient as any,
        coinConfigService as any,
        profilesService as any,
      ),
      coinApiClient,
      coinConfigService,
      profilesService,
    };
  }

  it('maps LEVEL_UP to DAILY_QUEST with metadata.kind=LEVEL_MILESTONE', async () => {
    const { adapter } = setup({ clamped: 6 });
    const prep = await adapter.preparePayload({
      userId: 'usr_1',
      amount: 50,
      idempotencyKey: 'level:milestone:usr_1:lv:10',
      source: CoinRewardSource.LEVEL_UP,
      description: 'Level 10',
      metadata: { level: 10 },
    });

    expect(prep.ok).toBe(true);
    expect(prep.payload).toMatchObject({
      userId: '966153253400231988',
      amount: 6,
      source: 'DAILY_QUEST',
      metadata: { level: 10, kind: 'LEVEL_MILESTONE' },
    });
  });

  it('blocks when Discord is not linked or rewardsEnabled is false', async () => {
    const { adapter: unlinked } = setup({ discordId: null });
    const res1 = await unlinked.preparePayload({
      userId: 'usr_1',
      amount: 1,
      idempotencyKey: 'k1',
      source: CoinRewardSource.TOWER,
      description: 'Tower 1',
    });
    expect(res1.ok).toBe(false);
    expect(res1.errorCode).toBe('DISCORD_NOT_LINKED');

    const { adapter: disabled } = setup({ rewardsEnabled: false });
    const res2 = await disabled.preparePayload({
      userId: 'usr_1',
      amount: 1,
      idempotencyKey: 'k2',
      source: CoinRewardSource.TOWER,
      description: 'Tower 1',
    });
    expect(res2.ok).toBe(false);
    expect(res2.errorCode).toBe('REWARDS_DISABLED');
  });
});
