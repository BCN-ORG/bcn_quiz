import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CoinRewardSource, CoinTransactionStatus } from '@prisma/client';
import { CoinAdminService } from './coin-admin.service';
import { CoinTrackingService } from './coin-tracking.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';

describe('CoinAdminService', () => {
  let service: CoinAdminService;

  const mockPrisma = {
    coinTransaction: {
      aggregate: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockProfilesService = {
    resolveUsers: jest
      .fn()
      .mockResolvedValue(
        new Map([
          [
            'user-1',
            { id: 'user-1', fullName: 'Nguyen Van A', email: 'a@example.com' },
          ],
        ]),
      ),
  };

  const mockCoinTrackingService = {
    reconcileTransaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoinAdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProfilesService, useValue: mockProfilesService },
        { provide: CoinTrackingService, useValue: mockCoinTrackingService },
      ],
    }).compile();

    service = module.get<CoinAdminService>(CoinAdminService);
  });

  describe('getOverview', () => {
    it('aggregates total coins, transaction counts, status breakdown, and source breakdown', async () => {
      mockPrisma.coinTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 1500 },
      });
      mockPrisma.coinTransaction.count.mockResolvedValue(300);
      mockPrisma.coinTransaction.groupBy
        .mockResolvedValueOnce([
          {
            status: CoinTransactionStatus.SUCCESS,
            _count: { id: 250 },
            _sum: { amount: 1500 },
          },
          {
            status: CoinTransactionStatus.FAILED,
            _count: { id: 50 },
            _sum: { amount: 200 },
          },
        ])
        .mockResolvedValueOnce([
          {
            source: CoinRewardSource.TOWER,
            _count: { id: 100 },
            _sum: { amount: 100 },
          },
          {
            source: CoinRewardSource.BOSS,
            _count: { id: 100 },
            _sum: { amount: 500 },
          },
          {
            source: CoinRewardSource.BOUNTY,
            _count: { id: 100 },
            _sum: { amount: 900 },
          },
        ]);
      mockPrisma.coinTransaction.findMany
        .mockResolvedValueOnce([
          {
            id: 'tx-1',
            userId: 'user-1',
            amount: 5,
            source: CoinRewardSource.BOSS,
            status: CoinTransactionStatus.SUCCESS,
          },
        ])
        .mockResolvedValueOnce([{ userId: 'user-1' }, { userId: 'user-2' }]);

      const result = await service.getOverview();

      expect(result.totalCoinsDistributed).toBe(1500);
      expect(result.totalTransactions).toBe(300);
      expect(result.uniqueRecipients).toBe(2);
      expect(result.statusBreakdown[CoinTransactionStatus.SUCCESS].count).toBe(
        250,
      );
      expect(result.sourceBreakdown[CoinRewardSource.BOSS].totalCoins).toBe(
        500,
      );
      expect(result.recentTransactions.length).toBe(1);
      expect(result.recentTransactions[0].username).toBe('Nguyen Van A');
    });
  });

  describe('getTransactions', () => {
    it('returns paginated transactions with profiles resolved', async () => {
      mockPrisma.coinTransaction.count.mockResolvedValue(1);
      mockPrisma.coinTransaction.findMany.mockResolvedValue([
        {
          id: 'tx-1',
          userId: 'user-1',
          amount: 5,
          source: CoinRewardSource.BOSS,
          status: CoinTransactionStatus.SUCCESS,
          createdAt: new Date(),
        },
      ]);

      const result = await service.getTransactions({
        page: 1,
        limit: 10,
        status: CoinTransactionStatus.SUCCESS,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].username).toBe('Nguyen Van A');
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNext).toBe(false);
    });
  });

  describe('getTransactionById', () => {
    it('returns transaction details if found', async () => {
      mockPrisma.coinTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        amount: 5,
        source: CoinRewardSource.BOSS,
        status: CoinTransactionStatus.SUCCESS,
      });

      const result = await service.getTransactionById('tx-1');
      expect(result.id).toBe('tx-1');
      expect(result.username).toBe('Nguyen Van A');
    });

    it('throws NotFoundException if transaction not found', async () => {
      mockPrisma.coinTransaction.findUnique.mockResolvedValue(null);
      await expect(service.getTransactionById('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getUserRewardHistory', () => {
    it('returns history, aggregated earned coins, and breakdown by source', async () => {
      mockPrisma.coinTransaction.count.mockResolvedValue(2);
      mockPrisma.coinTransaction.findMany.mockResolvedValue([
        {
          id: 'tx-1',
          userId: 'user-1',
          amount: 10,
          source: CoinRewardSource.BOUNTY,
          status: CoinTransactionStatus.SUCCESS,
        },
      ]);
      mockPrisma.coinTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 10 } }) // success
        .mockResolvedValueOnce({ _sum: { amount: 0 } }); // pending
      mockPrisma.coinTransaction.groupBy.mockResolvedValue([
        {
          source: CoinRewardSource.BOUNTY,
          _count: { id: 1 },
          _sum: { amount: 10 },
        },
      ]);

      const result = await service.getUserRewardHistory('user-1');

      expect(result.userId).toBe('user-1');
      expect(result.totalCoinsEarned).toBe(10);
      expect(result.username).toBe('Nguyen Van A');
      expect(result.sourceBreakdown[CoinRewardSource.BOUNTY].totalCoins).toBe(
        10,
      );
    });
  });

  describe('exportTransactionsCsv', () => {
    it('produces a valid CSV with UTF-8 BOM', async () => {
      mockPrisma.coinTransaction.findMany.mockResolvedValue([
        {
          id: 'tx-1',
          userId: 'user-1',
          amount: 5,
          source: CoinRewardSource.BOSS,
          status: CoinTransactionStatus.SUCCESS,
          reason: 'Boss defeat milestone',
          referenceId: '2',
          seasonId: 'season-w46',
          externalTxId: 'ext-tx-123',
          idempotencyKey: 'boss:tx:1',
          createdAt: new Date('2026-11-18T10:00:00.000Z'),
          processedAt: new Date('2026-11-18T10:00:05.000Z'),
          errorMessage: null,
        },
      ]);

      const result = await service.exportTransactionsCsv({});
      expect(result.filename).toMatch(
        /^coin-transactions-\d{4}-\d{2}-\d{2}\.csv$/,
      );

      const content = result.buffer.toString('utf-8');
      expect(content.startsWith('\uFEFF')).toBe(true);
      expect(content).toContain('ID,User ID,Username,Source,Amount');
      expect(content).toContain('Nguyen Van A');
      expect(content).toContain('Boss defeat milestone');
    });
  });
});
