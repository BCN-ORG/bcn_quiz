import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { BossCoinService } from './boss-coin.service';
import { BossReconciliationService } from './boss-reconciliation.service';
import { BOSS_COIN_SERVICE_PROVIDER } from './coin-provider.interface';

describe('BossCoinService & BossReconciliationService', () => {
  let service: BossCoinService;
  let reconciliationService: BossReconciliationService;

  const mockPrismaService = {
    bossRewardTransaction: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockCoinProvider = {
    creditReward: jest.fn(),
    checkStatus: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BossCoinService,
        BossReconciliationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: BOSS_COIN_SERVICE_PROVIDER, useValue: mockCoinProvider },
      ],
    }).compile();

    service = module.get<BossCoinService>(BossCoinService);
    reconciliationService = module.get<BossReconciliationService>(
      BossReconciliationService,
    );
  });

  describe('generateIdempotencyKey', () => {
    it('generates deterministic idempotency key', () => {
      const key = service.generateIdempotencyKey('2026-W46', 'user-1', 1);
      expect(key).toBe('boss:reward:week:2026-W46:user:user-1:m:1');
    });
  });

  describe('distributeMilestoneReward', () => {
    it('skips if non-failed transaction already exists', async () => {
      mockPrismaService.bossRewardTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        status: 'SUCCESS',
      });

      const res = await service.distributeMilestoneReward(
        'user-1',
        'season-1',
        '2026-W46',
        1,
        300,
        'Rương Đồng',
        5,
      );

      expect(res?.status).toBe('SUCCESS');
      expect(mockCoinProvider.creditReward).not.toHaveBeenCalled();
    });

    it('creates PENDING record and sets processedAt only when status is SUCCESS', async () => {
      mockPrismaService.bossRewardTransaction.findUnique.mockResolvedValue(
        null,
      );
      mockPrismaService.bossRewardTransaction.create.mockResolvedValue({
        id: 'tx-created',
        status: 'PENDING',
      });
      mockCoinProvider.creditReward.mockResolvedValue({
        success: true,
        externalTxId: 'ext-999',
        status: 'SUCCESS',
      });
      mockPrismaService.bossRewardTransaction.update.mockResolvedValue({
        id: 'tx-created',
        status: 'SUCCESS',
        externalTxId: 'ext-999',
      });

      const res = await service.distributeMilestoneReward(
        'user-1',
        'season-1',
        '2026-W46',
        2,
        600,
        'Rương Bạc',
        5,
      );

      expect(
        mockPrismaService.bossRewardTransaction.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            milestoneIndex: 2,
            rewardCoins: 5,
            status: 'PENDING',
          }),
        }),
      );
      expect(
        mockPrismaService.bossRewardTransaction.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SUCCESS',
            processedAt: expect.any(Date),
          }),
        }),
      );
      expect(mockCoinProvider.creditReward).toHaveBeenCalled();
      expect(res?.status).toBe('SUCCESS');
    });

    it('atomically claims FAILED transaction to PENDING before retrying provider and leaves processedAt null if not SUCCESS', async () => {
      mockPrismaService.bossRewardTransaction.findUnique.mockResolvedValue({
        id: 'tx-failed',
        status: 'FAILED',
      });
      mockPrismaService.bossRewardTransaction.updateMany.mockResolvedValue({
        count: 1,
      });
      mockCoinProvider.creditReward.mockResolvedValue({
        success: false,
        status: 'FAILED',
        errorMessage: 'Declined',
      });
      mockPrismaService.bossRewardTransaction.update.mockResolvedValue({
        id: 'tx-failed',
        status: 'FAILED',
        processedAt: null,
      });

      await service.distributeMilestoneReward(
        'user-1',
        'season-1',
        '2026-W46',
        1,
        300,
      );

      expect(
        mockPrismaService.bossRewardTransaction.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tx-failed', status: 'FAILED' },
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
      expect(
        mockPrismaService.bossRewardTransaction.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            processedAt: null,
          }),
        }),
      );
    });

    it('marks UNKNOWN when provider throws ambiguous error (timeout)', async () => {
      mockPrismaService.bossRewardTransaction.findUnique.mockResolvedValue(
        null,
      );
      mockPrismaService.bossRewardTransaction.create.mockResolvedValue({
        id: 'tx-created',
        status: 'PENDING',
      });
      mockCoinProvider.creditReward.mockRejectedValue(
        new Error('External Coin Gateway Timeout (504)'),
      );
      mockPrismaService.bossRewardTransaction.update.mockResolvedValue({
        id: 'tx-created',
        status: 'UNKNOWN',
      });

      const res = await service.distributeMilestoneReward(
        'user-1',
        'season-1',
        '2026-W46',
        1,
        300,
      );

      expect(res?.status).toBe('UNKNOWN');
      expect(
        mockPrismaService.bossRewardTransaction.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'UNKNOWN',
            retryCount: { increment: 1 },
          }),
        }),
      );
    });
  });

  describe('BossReconciliationService', () => {
    it('queries only PENDING/UNKNOWN transactions with updatedAt <= now - 30s', async () => {
      mockPrismaService.bossRewardTransaction.findMany.mockResolvedValue([]);

      await reconciliationService.reconcilePendingTransactions(25, 5);

      expect(
        mockPrismaService.bossRewardTransaction.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['PENDING', 'UNKNOWN'] },
            retryCount: { lt: 5 },
            updatedAt: { lte: expect.any(Date) },
          }),
        }),
      );
    });
  });
});
