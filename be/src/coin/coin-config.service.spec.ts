import { BadRequestException } from '@nestjs/common';
import { CoinRewardSource } from '@prisma/client';
import { CoinConfigService } from './coin-config.service';

describe('CoinConfigService', () => {
  const defaultRow = {
    id: 'default',
    maxRewardCap: 9,
    dailyChestCoins: 5,
    levelMilestoneCoins: { '3': 3, '6': 5 },
    botWarningThreshold: 100,
    botCriticalThreshold: 20,
    rewardsEnabled: true,
    transfersEnabled: true,
    updatedBy: null,
    updatedAt: new Date(),
  };

  function setup(row = defaultRow) {
    const prisma = {
      coinSystemConfig: {
        upsert: jest.fn().mockResolvedValue(row),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...row, ...data }),
          ),
      },
    };
    return { service: new CoinConfigService(prisma as any), prisma };
  }

  it('keeps TOWER at 1 coin and clamps other sources to maxRewardCap', async () => {
    const { service } = setup({ ...defaultRow, maxRewardCap: 7 });
    expect(await service.clampRewardAmount(CoinRewardSource.TOWER, 5)).toBe(1);
    expect(await service.clampRewardAmount(CoinRewardSource.BOUNTY, 50)).toBe(
      7,
    );
    expect(await service.clampRewardAmount(CoinRewardSource.BOSS, 5)).toBe(5);
  });

  it('rejects maxRewardCap >= 10 or invalid bot thresholds', async () => {
    const { service } = setup();
    await expect(
      service.updateConfig({ maxRewardCap: 10 }, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateConfig(
        { botWarningThreshold: 50, botCriticalThreshold: 50 },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
