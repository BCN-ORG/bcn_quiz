import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MockWalletTxStatus, MockWalletTxType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { MockCoinWalletService } from './mock-coin-wallet.service';

describe('MockCoinWalletService', () => {
  let service: MockCoinWalletService;
  let prismaMock: {
    mockWallet: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    mockWalletTransaction: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let profilesMock: {
    resolveUsersDetailed: jest.Mock;
    resolveUsers: jest.Mock;
    searchUserIds: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = {
      mockWallet: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      mockWalletTransaction: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    profilesMock = {
      resolveUsersDetailed: jest.fn(),
      resolveUsers: jest.fn(),
      searchUserIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockCoinWalletService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ProfilesService, useValue: profilesMock },
      ],
    }).compile();

    service = module.get<MockCoinWalletService>(MockCoinWalletService);
  });

  describe('getBalance', () => {
    it('returns wallet balance and initializes if not found', async () => {
      const mockWallet = {
        id: 'w-1',
        userId: 'user-1',
        balance: 100,
        lastSyncedAt: new Date(),
        syncStatus: 'SYNCED',
      };
      prismaMock.mockWallet.upsert.mockResolvedValue(mockWallet);

      const result = await service.getBalance('user-1');

      expect(prismaMock.mockWallet.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: {},
        create: {
          userId: 'user-1',
          balance: 100,
          syncStatus: 'SYNCED',
          lastSyncedAt: expect.any(Date),
        },
      });
      expect(result).toEqual({
        balance: 100,
        discordLinked: true,
        isMock: true,
        lastSyncedAt: mockWallet.lastSyncedAt,
        syncStatus: 'SYNCED',
      });
    });
  });

  describe('syncBalance', () => {
    it('updates lastSyncedAt and preserves balance', async () => {
      const mockWallet = {
        id: 'w-1',
        userId: 'user-1',
        balance: 250,
        lastSyncedAt: new Date(),
        syncStatus: 'SYNCED',
      };
      prismaMock.mockWallet.upsert.mockResolvedValue(mockWallet);

      const result = await service.syncBalance('user-1');

      expect(prismaMock.mockWallet.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: {
          lastSyncedAt: expect.any(Date),
          syncStatus: 'SYNCED',
        },
        create: {
          userId: 'user-1',
          balance: 100,
          syncStatus: 'SYNCED',
          lastSyncedAt: expect.any(Date),
        },
      });
      expect(result.balance).toBe(250);
      expect(result.syncStatus).toBe('SYNCED');
    });
  });

  describe('transferCoin', () => {
    it('rejects self-transfer', async () => {
      await expect(
        service.transferCoin('user-1', 'Alice', 'user-1', 50),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-positive amount', async () => {
      await expect(
        service.transferCoin('user-1', 'Alice', 'user-2', 0),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.transferCoin('user-1', 'Alice', 'user-2', -10),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-integer amount', async () => {
      await expect(
        service.transferCoin('user-1', 'Alice', 'user-2', 12.5),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns existing transaction if idempotencyKey already processed', async () => {
      const existingTx = {
        id: 'tx-1',
        reference: 'TX-SENT-123',
        idempotencyKey: 'idem-1',
        amount: 50,
        type: MockWalletTxType.SENT,
        status: MockWalletTxStatus.SUCCESS,
      };
      prismaMock.mockWalletTransaction.findUnique.mockResolvedValue(existingTx);
      prismaMock.mockWallet.findUnique.mockResolvedValue({
        userId: 'user-1',
        balance: 150,
      });

      const result = await service.transferCoin(
        'user-1',
        'Alice',
        'user-2',
        50,
        'idem-1',
      );

      expect(result.transaction).toBe(existingTx);
      expect(result.senderBalance).toBe(150);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects if recipient does not exist in Profiles or MockWallet', async () => {
      prismaMock.mockWalletTransaction.findUnique.mockResolvedValue(null);
      profilesMock.resolveUsersDetailed.mockResolvedValue({
        users: new Map(),
        failed: false,
      });
      prismaMock.mockWallet.findUnique.mockResolvedValue(null);

      await expect(
        service.transferCoin('user-1', 'Alice', 'non-existent', 50),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when sender has insufficient balance', async () => {
      prismaMock.mockWalletTransaction.findUnique.mockResolvedValue(null);
      profilesMock.resolveUsersDetailed.mockResolvedValue({
        users: new Map([
          [
            'user-2',
            {
              id: 'user-2',
              fullName: 'Bob',
              email: 'bob@test.com',
              avatarUrl: null,
            },
          ],
        ]),
        failed: false,
      });

      // Sender wallet balance is 30, trying to transfer 50
      prismaMock.mockWallet.findUnique.mockImplementation(({ where }) => {
        if (where.userId === 'user-1')
          return Promise.resolve({ id: 'w-1', userId: 'user-1', balance: 30 });
        if (where.userId === 'user-2')
          return Promise.resolve({ id: 'w-2', userId: 'user-2', balance: 100 });
        return Promise.resolve(null);
      });

      await expect(
        service.transferCoin('user-1', 'Alice', 'user-2', 50),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully transfers coin atomically between sender and recipient', async () => {
      prismaMock.mockWalletTransaction.findUnique.mockResolvedValue(null);
      profilesMock.resolveUsersDetailed.mockResolvedValue({
        users: new Map([
          [
            'user-2',
            {
              id: 'user-2',
              fullName: 'Bob',
              email: 'bob@test.com',
              avatarUrl: null,
            },
          ],
        ]),
        failed: false,
      });

      const senderWallet = { id: 'w-1', userId: 'user-1', balance: 100 };
      const recipientWallet = { id: 'w-2', userId: 'user-2', balance: 50 };

      prismaMock.mockWallet.findUnique.mockImplementation(({ where }) => {
        if (where.userId === 'user-1') return Promise.resolve(senderWallet);
        if (where.userId === 'user-2') return Promise.resolve(recipientWallet);
        return Promise.resolve(null);
      });

      prismaMock.mockWallet.update.mockImplementation(({ where }) => {
        if (where.id === 'w-1')
          return Promise.resolve({ ...senderWallet, balance: 60 });
        if (where.id === 'w-2')
          return Promise.resolve({ ...recipientWallet, balance: 90 });
        return Promise.resolve(null);
      });

      const createdTx = {
        id: 'tx-new',
        reference: 'TX-SENT-999',
        type: MockWalletTxType.SENT,
        amount: 40,
        status: MockWalletTxStatus.SUCCESS,
        counterpartUserId: 'user-2',
        counterpartName: 'Bob',
      };
      prismaMock.mockWalletTransaction.create.mockResolvedValue(createdTx);

      const result = await service.transferCoin(
        'user-1',
        'Alice',
        'user-2',
        40,
        'idem-key-100',
        'Tặng bạn Bob',
      );

      expect(prismaMock.mockWallet.update).toHaveBeenCalledWith({
        where: { id: 'w-1' },
        data: { balance: { decrement: 40 } },
      });
      expect(prismaMock.mockWallet.update).toHaveBeenCalledWith({
        where: { id: 'w-2' },
        data: { balance: { increment: 40 } },
      });
      expect(prismaMock.mockWalletTransaction.create).toHaveBeenCalledTimes(2);
      expect(result.senderBalance).toBe(60);
      expect(result.recipientBalance).toBe(90);
      expect(result.transaction).toBe(createdTx);
    });
  });

  describe('getTransactionHistory', () => {
    it('returns paginated transactions with query filters', async () => {
      const mockTxs = [
        {
          id: 'tx-1',
          reference: 'REF-1',
          type: MockWalletTxType.SENT,
          amount: 20,
        },
      ];
      prismaMock.mockWalletTransaction.findMany.mockResolvedValue(mockTxs);
      prismaMock.mockWalletTransaction.count.mockResolvedValue(1);

      const result = await service.getTransactionHistory('user-1', {
        page: 1,
        limit: 10,
        type: MockWalletTxType.SENT,
        search: 'REF-1',
      });

      expect(prismaMock.mockWalletTransaction.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: 'user-1',
          type: MockWalletTxType.SENT,
          OR: expect.any(Array),
        }),
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
      expect(result.transactions).toEqual(mockTxs);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('getTransactionDetail', () => {
    it('returns transaction when owned by the user', async () => {
      const tx = { id: 'tx-1', userId: 'user-1', amount: 50 };
      prismaMock.mockWalletTransaction.findFirst.mockResolvedValue(tx);

      const result = await service.getTransactionDetail('user-1', 'tx-1');
      expect(result).toBe(tx);
    });

    it('throws NotFoundException when transaction belongs to another user', async () => {
      prismaMock.mockWalletTransaction.findFirst.mockResolvedValue(null);

      await expect(
        service.getTransactionDetail('user-1', 'tx-other'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('searchUsers', () => {
    it('returns empty array if keyword is empty', async () => {
      const result = await service.searchUsers('user-1', '   ');
      expect(result).toEqual([]);
    });

    it('searches users from ProfilesService and excludes current user', async () => {
      profilesMock.searchUserIds.mockResolvedValue(['user-1', 'user-2']);
      profilesMock.resolveUsers.mockResolvedValue(
        new Map([
          [
            'user-2',
            {
              id: 'user-2',
              fullName: 'Bob',
              email: 'bob@test.com',
              avatarUrl: null,
            },
          ],
        ]),
      );

      const result = await service.searchUsers('user-1', 'bob');

      expect(result).toEqual([
        {
          id: 'user-2',
          fullName: 'Bob',
          email: 'bob@test.com',
          avatarUrl: null,
          discordLinked: true,
        },
      ]);
    });

    it('falls back to mock wallets when ProfilesService search fails', async () => {
      profilesMock.searchUserIds.mockRejectedValue(new Error('Network down'));
      prismaMock.mockWallet.findMany.mockResolvedValue([{ userId: 'user-3' }]);

      const result = await service.searchUsers('user-1', 'user-3');

      expect(result).toEqual([
        {
          id: 'user-3',
          fullName: 'user-3',
          email: 'user-3@example.com',
          avatarUrl: null,
          discordLinked: true,
        },
      ]);
    });
  });

  describe('creditReward', () => {
    it('credits reward idempotently and records REWARD transaction', async () => {
      prismaMock.mockWalletTransaction.findUnique.mockResolvedValue(null);
      prismaMock.mockWallet.upsert.mockResolvedValue({
        id: 'w-1',
        userId: 'user-1',
        balance: 105,
      });
      const createdTx = {
        id: 'tx-rw-1',
        type: MockWalletTxType.REWARD,
        amount: 5,
        status: MockWalletTxStatus.SUCCESS,
      };
      prismaMock.mockWalletTransaction.create.mockResolvedValue(createdTx);

      const res = await service.creditReward({
        userId: 'user-1',
        amount: 5,
        idempotencyKey: 'boss:reward:week:2026-W47:user:user-1:m:1',
        source: 'BOSS',
        description: 'Đạt mốc 1 Boss Chiến (300 điểm)',
      });

      expect(res.credited).toBe(true);
      expect(res.transaction).toBe(createdTx);
      expect(prismaMock.mockWallet.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          update: expect.objectContaining({ balance: { increment: 5 } }),
          create: expect.objectContaining({ userId: 'user-1', balance: 105 }),
        }),
      );
      expect(prismaMock.mockWalletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            type: MockWalletTxType.REWARD,
            amount: 5,
            status: MockWalletTxStatus.SUCCESS,
            counterpartName: 'Phần thưởng Săn Boss',
            idempotencyKey: 'boss:reward:week:2026-W47:user:user-1:m:1',
          }),
        }),
      );
    });

    it('skips duplicate reward with same idempotencyKey', async () => {
      const existingTx = {
        id: 'tx-rw-1',
        type: MockWalletTxType.REWARD,
        amount: 5,
      };
      prismaMock.mockWalletTransaction.findUnique.mockResolvedValue(existingTx);

      const res = await service.creditReward({
        userId: 'user-1',
        amount: 5,
        idempotencyKey: 'boss:reward:week:2026-W47:user:user-1:m:1',
        source: 'BOSS',
        description: 'Đạt mốc 1 Boss Chiến',
      });

      expect(res.credited).toBe(false);
      expect(res.transaction).toBe(existingTx);
      expect(prismaMock.mockWallet.upsert).not.toHaveBeenCalled();
    });
  });
});
