import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { NotFoundException } from '@nestjs/common';
import {
  CoinRewardSource,
  CoinTransactionStatus,
  Prisma,
} from '@prisma/client';
import { CoinTrackingService } from './coin-tracking.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CoinTrackingService', () => {
  let service: CoinTrackingService;

  const mockPrisma = {
    coinTransaction: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    towerRewardTransaction: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    bossRewardTransaction: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    bountyRewardTransaction: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockModuleRef = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoinTrackingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ModuleRef, useValue: mockModuleRef },
      ],
    }).compile();

    service = module.get<CoinTrackingService>(CoinTrackingService);
  });

  describe('recordPending', () => {
    it('creates a new pending transaction when none exists', async () => {
      mockPrisma.coinTransaction.findUnique.mockResolvedValue(null);
      mockPrisma.coinTransaction.create.mockResolvedValue({
        id: 'ctx-1',
        userId: 'user-123',
        amount: 5,
        source: CoinRewardSource.BOSS,
        idempotencyKey: 'boss:tx:1',
        status: CoinTransactionStatus.PENDING,
      });

      const result = await service.recordPending({
        userId: 'user-123',
        amount: 5,
        source: CoinRewardSource.BOSS,
        idempotencyKey: 'boss:tx:1',
      });

      expect(mockPrisma.coinTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-123',
          amount: 5,
          source: CoinRewardSource.BOSS,
          idempotencyKey: 'boss:tx:1',
          status: CoinTransactionStatus.PENDING,
        }),
      });
      expect(result.id).toBe('ctx-1');
    });

    it('returns existing transaction if already recorded and not FAILED', async () => {
      mockPrisma.coinTransaction.findUnique.mockResolvedValue({
        id: 'ctx-existing',
        userId: 'user-123',
        status: CoinTransactionStatus.PENDING,
      });

      const result = await service.recordPending({
        userId: 'user-123',
        amount: 5,
        source: CoinRewardSource.BOSS,
        idempotencyKey: 'boss:tx:1',
      });

      expect(result.id).toBe('ctx-existing');
      expect(mockPrisma.coinTransaction.create).not.toHaveBeenCalled();
    });

    it('allows retry if existing transaction was FAILED', async () => {
      mockPrisma.coinTransaction.findUnique.mockResolvedValue({
        id: 'ctx-failed',
        userId: 'user-123',
        status: CoinTransactionStatus.FAILED,
      });
      mockPrisma.coinTransaction.update.mockResolvedValue({
        id: 'ctx-failed',
        status: CoinTransactionStatus.PENDING,
      });

      const result = await service.recordPending({
        userId: 'user-123',
        amount: 5,
        source: CoinRewardSource.BOSS,
        idempotencyKey: 'boss:tx:1',
      });

      expect(mockPrisma.coinTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ctx-failed' },
          data: expect.objectContaining({
            status: CoinTransactionStatus.PENDING,
          }),
        }),
      );
      expect(result.status).toBe(CoinTransactionStatus.PENDING);
    });

    it('handles P2002 concurrency conflict safely', async () => {
      mockPrisma.coinTransaction.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'ctx-concurrent',
          idempotencyKey: 'key-1',
        });

      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique failed', {
        code: 'P2002',
        clientVersion: '7.10.1',
      });
      mockPrisma.coinTransaction.create.mockRejectedValue(p2002);

      const result = await service.recordPending({
        userId: 'u1',
        amount: 1,
        source: CoinRewardSource.TOWER,
        idempotencyKey: 'key-1',
      });

      expect(result.id).toBe('ctx-concurrent');
    });
  });

  describe('recordSuccess, recordUnknown, recordFailed', () => {
    it('recordSuccess updates status to SUCCESS with externalTxId and processedAt', async () => {
      mockPrisma.coinTransaction.update.mockResolvedValue({
        id: 'ctx-1',
        status: CoinTransactionStatus.SUCCESS,
        externalTxId: 'ext-999',
      });

      const res = await service.recordSuccess('key-1', 'ext-999', { ok: true });
      expect(mockPrisma.coinTransaction.update).toHaveBeenCalledWith({
        where: { idempotencyKey: 'key-1' },
        data: expect.objectContaining({
          status: CoinTransactionStatus.SUCCESS,
          externalTxId: 'ext-999',
          processedAt: expect.any(Date),
        }),
      });
      expect(res?.status).toBe(CoinTransactionStatus.SUCCESS);
    });

    it('recordUnknown updates status to UNKNOWN with errorMessage and increments retryCount', async () => {
      mockPrisma.coinTransaction.update.mockResolvedValue({
        id: 'ctx-1',
        status: CoinTransactionStatus.UNKNOWN,
      });

      await service.recordUnknown('key-1', 'Timeout gateway');
      expect(mockPrisma.coinTransaction.update).toHaveBeenCalledWith({
        where: { idempotencyKey: 'key-1' },
        data: expect.objectContaining({
          status: CoinTransactionStatus.UNKNOWN,
          errorMessage: 'Timeout gateway',
          retryCount: { increment: 1 },
        }),
      });
    });

    it('recordFailed updates status to FAILED with error message', async () => {
      mockPrisma.coinTransaction.update.mockResolvedValue({
        id: 'ctx-1',
        status: CoinTransactionStatus.FAILED,
      });

      await service.recordFailed('key-1', 'Insufficient balance');
      expect(mockPrisma.coinTransaction.update).toHaveBeenCalledWith({
        where: { idempotencyKey: 'key-1' },
        data: expect.objectContaining({
          status: CoinTransactionStatus.FAILED,
          errorMessage: 'Insufficient balance',
          processedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('reconcileTransaction', () => {
    it('throws NotFoundException if transaction does not exist', async () => {
      mockPrisma.coinTransaction.findUnique.mockResolvedValue(null);
      await expect(
        service.reconcileTransaction('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns early if transaction is already SUCCESS', async () => {
      mockPrisma.coinTransaction.findUnique.mockResolvedValue({
        id: 'tx-done',
        status: CoinTransactionStatus.SUCCESS,
      });

      const result = await service.reconcileTransaction('tx-done');
      expect(result.success).toBe(true);
      expect(result.reconciled).toBe(false);
      expect(result.message).toContain('SUCCESS');
    });

    it('reconciles with external provider when provider returns SUCCESS', async () => {
      mockPrisma.coinTransaction.findUnique.mockResolvedValue({
        id: 'tx-pending',
        source: CoinRewardSource.TOWER,
        status: CoinTransactionStatus.PENDING,
        idempotencyKey: 'tower:k1',
        reconciliationHistory: [],
      });

      const mockProvider = {
        checkStatus: jest.fn().mockResolvedValue({
          status: 'SUCCESS',
          externalTxId: 'ext-reconciled-1',
        }),
      };
      mockModuleRef.get.mockReturnValue(mockProvider);

      mockPrisma.coinTransaction.update.mockResolvedValue({
        id: 'tx-pending',
        status: CoinTransactionStatus.SUCCESS,
        externalTxId: 'ext-reconciled-1',
      });

      const res = await service.reconcileTransaction('tx-pending', 'admin-1');

      expect(mockProvider.checkStatus).toHaveBeenCalledWith('tower:k1');
      expect(mockPrisma.coinTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tx-pending' },
          data: expect.objectContaining({
            status: CoinTransactionStatus.SUCCESS,
            externalTxId: 'ext-reconciled-1',
          }),
        }),
      );
      expect(mockPrisma.towerRewardTransaction.updateMany).toHaveBeenCalledWith(
        {
          where: { idempotencyKey: 'tower:k1' },
          data: expect.objectContaining({
            status: 'SUCCESS',
            externalTxId: 'ext-reconciled-1',
          }),
        },
      );
      expect(res.reconciled).toBe(true);
      expect(res.success).toBe(true);
    });
  });

  describe('backfillFromExistingTables', () => {
    it('idempotently backfills missing historical records from Tower, Boss, Bounty', async () => {
      mockPrisma.towerRewardTransaction.findMany.mockResolvedValue([
        {
          id: 'tw-1',
          userId: 'u1',
          seasonId: 's1',
          floor: 5,
          rewardCoins: 1,
          idempotencyKey: 'tower:1',
          status: 'SUCCESS',
          externalTxId: 'ext-tw-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrisma.bossRewardTransaction.findMany.mockResolvedValue([
        {
          id: 'bs-1',
          userId: 'u2',
          seasonId: 's2',
          milestoneIndex: 2,
          milestoneAt: 600,
          rewardCoins: 5,
          idempotencyKey: 'boss:1',
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrisma.bountyRewardTransaction.findMany.mockResolvedValue([
        {
          id: 'bty-1',
          userId: 'u3',
          bountyId: 'b1',
          assignmentId: 'asg-1',
          rewardCoins: 10,
          idempotencyKey: 'bounty:1',
          status: 'COMPLETED',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      mockPrisma.coinTransaction.findUnique.mockResolvedValue(null);
      mockPrisma.coinTransaction.create.mockResolvedValue({});

      const counts = await service.backfillFromExistingTables();

      expect(counts.tower).toBe(1);
      expect(counts.boss).toBe(1);
      expect(counts.bounty).toBe(1);
      expect(mockPrisma.coinTransaction.create).toHaveBeenCalledTimes(3);
    });
  });
});
