import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request as ExpressRequest } from 'express';
import { AuthService } from '../auth/auth.service';
import { BearerAuthGuard } from '../auth/guards/auth.guard';
import { CoinWalletService } from './coin-wallet.interface';
import { TransferCoinDto, WalletHistoryQueryDto } from './dto/wallet.dto';
import { WalletController } from './wallet.controller';

describe('WalletController', () => {
  let controller: WalletController;
  let serviceMock: {
    getBalance: jest.Mock;
    syncBalance: jest.Mock;
    transferCoin: jest.Mock;
    getTransactionHistory: jest.Mock;
    getTransactionDetail: jest.Mock;
    searchUsers: jest.Mock;
  };

  const createReq = (user?: Record<string, unknown>): ExpressRequest =>
    ({
      user,
      headers: {},
    }) as unknown as ExpressRequest;

  beforeEach(async () => {
    serviceMock = {
      getBalance: jest.fn(),
      syncBalance: jest.fn(),
      transferCoin: jest.fn(),
      getTransactionHistory: jest.fn(),
      getTransactionDetail: jest.fn(),
      searchUsers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        { provide: CoinWalletService, useValue: serviceMock },
        { provide: AuthService, useValue: { validateToken: jest.fn() } },
        BearerAuthGuard,
      ],
    }).compile();

    controller = module.get<WalletController>(WalletController);
  });

  describe('extractUserId', () => {
    it('throws UnauthorizedException when user has no valid id', async () => {
      const req = createReq({});
      await expect(controller.getBalance(req)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('extracts id from nested user token formats', async () => {
      const req1 = createReq({ id: 'user-1' });
      serviceMock.getBalance.mockResolvedValue({ balance: 100 });
      await controller.getBalance(req1);
      expect(serviceMock.getBalance).toHaveBeenCalledWith('user-1');

      const req2 = createReq({ data: { user: { id: 'user-2' } } });
      await controller.getBalance(req2);
      expect(serviceMock.getBalance).toHaveBeenCalledWith('user-2');
    });
  });

  describe('getBalance', () => {
    it('calls walletService.getBalance with user id', async () => {
      const req = createReq({ id: 'user-1' });
      const expected = {
        balance: 100,
        lastSyncedAt: new Date(),
        syncStatus: 'SYNCED',
      };
      serviceMock.getBalance.mockResolvedValue(expected);

      const result = await controller.getBalance(req);
      expect(result).toBe(expected);
      expect(serviceMock.getBalance).toHaveBeenCalledWith('user-1');
    });
  });

  describe('syncBalance', () => {
    it('calls walletService.syncBalance with user id', async () => {
      const req = createReq({ id: 'user-1' });
      const expected = {
        balance: 100,
        lastSyncedAt: new Date(),
        syncStatus: 'SYNCED',
      };
      serviceMock.syncBalance.mockResolvedValue(expected);

      const result = await controller.syncBalance(req);
      expect(result).toBe(expected);
      expect(serviceMock.syncBalance).toHaveBeenCalledWith('user-1');
    });
  });

  describe('transferCoin', () => {
    it('extracts user info and calls walletService.transferCoin', async () => {
      const req = createReq({ id: 'user-1', fullName: 'Alice Nguyen' });
      const dto: TransferCoinDto = {
        recipientId: 'user-2',
        amount: 25,
        description: 'Mừng sinh nhật',
        idempotencyKey: 'idem-key-1',
      };
      const expected = {
        senderBalance: 75,
        message: 'Chuyển coin thành công.',
      };
      serviceMock.transferCoin.mockResolvedValue(expected);

      const result = await controller.transferCoin(req, dto);
      expect(result).toBe(expected);
      expect(serviceMock.transferCoin).toHaveBeenCalledWith(
        'user-1',
        'Alice Nguyen',
        'user-2',
        25,
        'idem-key-1',
        'Mừng sinh nhật',
      );
    });
  });

  describe('getTransactions', () => {
    it('calls walletService.getTransactionHistory with query parameters', async () => {
      const req = createReq({ id: 'user-1' });
      const query: WalletHistoryQueryDto = { page: 2, limit: 10 };
      const expected = {
        transactions: [],
        total: 0,
        page: 2,
        limit: 10,
        totalPages: 0,
      };
      serviceMock.getTransactionHistory.mockResolvedValue(expected);

      const result = await controller.getTransactions(req, query);
      expect(result).toBe(expected);
      expect(serviceMock.getTransactionHistory).toHaveBeenCalledWith(
        'user-1',
        query,
      );
    });
  });

  describe('getTransactionDetail', () => {
    it('calls walletService.getTransactionDetail with user id and transaction id', async () => {
      const req = createReq({ id: 'user-1' });
      const expected = { id: 'tx-123', amount: 50 };
      serviceMock.getTransactionDetail.mockResolvedValue(expected);

      const result = await controller.getTransactionDetail(req, 'tx-123');
      expect(result).toBe(expected);
      expect(serviceMock.getTransactionDetail).toHaveBeenCalledWith(
        'user-1',
        'tx-123',
      );
    });
  });

  describe('searchUsers', () => {
    it('calls walletService.searchUsers with query q', async () => {
      const req = createReq({ id: 'user-1' });
      const expected = [{ id: 'user-2', fullName: 'Bob' }];
      serviceMock.searchUsers.mockResolvedValue(expected);

      const result = await controller.searchUsers(req, { q: 'bob' });
      expect(result).toBe(expected);
      expect(serviceMock.searchUsers).toHaveBeenCalledWith('user-1', 'bob');
    });
  });
});
