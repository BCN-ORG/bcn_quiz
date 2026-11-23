import { BadRequestException, Injectable } from '@nestjs/common';
import { CoinRewardSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CoinSystemConfigDto {
  id: string;
  maxRewardCap: number;
  dailyChestCoins: number;
  levelMilestoneCoins: Record<string, number>;
  botWarningThreshold: number;
  botCriticalThreshold: number;
  rewardsEnabled: boolean;
  transfersEnabled: boolean;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface UpdateCoinSystemConfigInput {
  maxRewardCap?: number;
  dailyChestCoins?: number;
  levelMilestoneCoins?: Record<string, number>;
  botWarningThreshold?: number;
  botCriticalThreshold?: number;
  rewardsEnabled?: boolean;
  transfersEnabled?: boolean;
}

const DEFAULT_MILESTONES: Record<string, number> = {
  '3': 3,
  '6': 5,
  '10': 6,
  '20': 7,
  '40': 8,
  '70': 9,
  '100': 9,
};

@Injectable()
export class CoinConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<CoinSystemConfigDto> {
    const row = await this.prisma.coinSystemConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        maxRewardCap: 9,
        dailyChestCoins: 5,
        levelMilestoneCoins: DEFAULT_MILESTONES,
        botWarningThreshold: 100,
        botCriticalThreshold: 20,
        rewardsEnabled: true,
        transfersEnabled: true,
      },
      update: {},
    });

    return {
      id: row.id,
      maxRewardCap: row.maxRewardCap,
      dailyChestCoins: row.dailyChestCoins,
      levelMilestoneCoins:
        (row.levelMilestoneCoins as Record<string, number>) ??
        DEFAULT_MILESTONES,
      botWarningThreshold: row.botWarningThreshold,
      botCriticalThreshold: row.botCriticalThreshold,
      rewardsEnabled: row.rewardsEnabled,
      transfersEnabled: row.transfersEnabled,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt,
    };
  }

  async updateConfig(
    input: UpdateCoinSystemConfigInput,
    adminUserId: string,
  ): Promise<CoinSystemConfigDto> {
    const current = await this.getConfig();
    const maxRewardCap = input.maxRewardCap ?? current.maxRewardCap;
    if (
      !Number.isInteger(maxRewardCap) ||
      maxRewardCap < 1 ||
      maxRewardCap > 9
    ) {
      throw new BadRequestException(
        'Trần chống lạm phát (maxRewardCap) phải là số nguyên từ 1 đến 9',
      );
    }

    const dailyChestCoins = input.dailyChestCoins ?? current.dailyChestCoins;
    if (
      !Number.isInteger(dailyChestCoins) ||
      dailyChestCoins < 1 ||
      dailyChestCoins > maxRewardCap
    ) {
      throw new BadRequestException(
        `Thưởng rương ngày phải từ 1 đến ${maxRewardCap} coin`,
      );
    }

    const levelMilestoneCoins =
      input.levelMilestoneCoins ?? current.levelMilestoneCoins;
    for (const [level, coins] of Object.entries(levelMilestoneCoins)) {
      if (!Number.isInteger(coins) || coins < 1 || coins > maxRewardCap) {
        throw new BadRequestException(
          `Thưởng mốc level ${level} phải từ 1 đến ${maxRewardCap} coin`,
        );
      }
    }

    const botWarningThreshold =
      input.botWarningThreshold ?? current.botWarningThreshold;
    const botCriticalThreshold =
      input.botCriticalThreshold ?? current.botCriticalThreshold;
    if (
      !Number.isInteger(botWarningThreshold) ||
      !Number.isInteger(botCriticalThreshold) ||
      botCriticalThreshold < 0 ||
      botCriticalThreshold >= botWarningThreshold
    ) {
      throw new BadRequestException(
        'Ngưỡng cảnh báo đỏ phải nhỏ hơn ngưỡng cảnh báo vàng và >= 0',
      );
    }

    const updated = await this.prisma.coinSystemConfig.update({
      where: { id: 'default' },
      data: {
        maxRewardCap,
        dailyChestCoins,
        levelMilestoneCoins,
        botWarningThreshold,
        botCriticalThreshold,
        rewardsEnabled: input.rewardsEnabled ?? current.rewardsEnabled,
        transfersEnabled: input.transfersEnabled ?? current.transfersEnabled,
        updatedBy: adminUserId,
      },
    });

    return {
      id: updated.id,
      maxRewardCap: updated.maxRewardCap,
      dailyChestCoins: updated.dailyChestCoins,
      levelMilestoneCoins: updated.levelMilestoneCoins as Record<
        string,
        number
      >,
      botWarningThreshold: updated.botWarningThreshold,
      botCriticalThreshold: updated.botCriticalThreshold,
      rewardsEnabled: updated.rewardsEnabled,
      transfersEnabled: updated.transfersEnabled,
      updatedBy: updated.updatedBy,
      updatedAt: updated.updatedAt,
    };
  }

  async clampRewardAmount(
    source: CoinRewardSource,
    amount: number,
  ): Promise<number> {
    if (source === CoinRewardSource.TOWER) {
      return 1;
    }
    const config = await this.getConfig();
    const safeAmount = Math.max(1, Math.floor(amount));
    return Math.min(safeAmount, config.maxRewardCap);
  }
}
