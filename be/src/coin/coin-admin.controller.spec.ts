import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { CoinAdminController } from './coin-admin.controller';
import { CoinAdminService } from './coin-admin.service';

describe('CoinAdminController', () => {
  let controller: CoinAdminController;

  const mockCoinAdminService = {
    getOverview: jest.fn(),
    getTransactions: jest.fn(),
    getTransactionById: jest.fn(),
    reconcileTransaction: jest.fn(),
    getUserRewardHistory: jest.fn(),
    exportTransactionsCsv: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CoinAdminController],
      providers: [
        { provide: CoinAdminService, useValue: mockCoinAdminService },
      ],
    }).compile();

    controller = module.get<CoinAdminController>(CoinAdminController);
  });

  it('GET /admin/coins/overview calls getOverview', async () => {
    mockCoinAdminService.getOverview.mockResolvedValue({
      totalCoinsDistributed: 100,
    });
    const res = await controller.getOverview();
    expect(res.totalCoinsDistributed).toBe(100);
    expect(mockCoinAdminService.getOverview).toHaveBeenCalled();
  });

  it('GET /admin/coins/transactions calls getTransactions', async () => {
    mockCoinAdminService.getTransactions.mockResolvedValue({
      items: [],
      pagination: {},
    });
    const query = { page: 1, limit: 10 };
    await controller.getTransactions(query);
    expect(mockCoinAdminService.getTransactions).toHaveBeenCalledWith(query);
  });

  it('GET /admin/coins/transactions/:id calls getTransactionById', async () => {
    mockCoinAdminService.getTransactionById.mockResolvedValue({ id: 'tx-1' });
    const res = await controller.getTransactionById('tx-1');
    expect(res.id).toBe('tx-1');
    expect(mockCoinAdminService.getTransactionById).toHaveBeenCalledWith(
      'tx-1',
    );
  });

  it('POST /admin/coins/transactions/:id/reconcile calls reconcileTransaction with admin id', async () => {
    mockCoinAdminService.reconcileTransaction.mockResolvedValue({
      success: true,
      reconciled: true,
    });
    const req = { user: { id: 'admin-user-42' } } as any;
    const res = await controller.reconcileTransaction('tx-1', req);
    expect(res.success).toBe(true);
    expect(mockCoinAdminService.reconcileTransaction).toHaveBeenCalledWith(
      'tx-1',
      'admin-user-42',
    );
  });

  it('GET /admin/coins/users/:userId/rewards calls getUserRewards', async () => {
    mockCoinAdminService.getUserRewardHistory.mockResolvedValue({
      userId: 'u1',
      transactions: [],
    });
    const res = await controller.getUserRewards('u1', { page: 1, limit: 20 });
    expect(res.userId).toBe('u1');
    expect(mockCoinAdminService.getUserRewardHistory).toHaveBeenCalledWith(
      'u1',
      { page: 1, limit: 20 },
    );
  });

  it('GET /admin/coins/export sets response headers and returns StreamableFile', async () => {
    mockCoinAdminService.exportTransactionsCsv.mockResolvedValue({
      buffer: Buffer.from('test,csv', 'utf-8'),
      filename: 'export.csv',
    });

    const mockRes = {
      setHeader: jest.fn(),
    } as any;

    const stream = await controller.exportCsv({}, mockRes);
    expect(stream).toBeInstanceOf(StreamableFile);
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="export.csv"',
    );
  });
});
