import { Test, TestingModule } from '@nestjs/testing';
import { TowerReconciliationService } from './tower-reconciliation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { COIN_SERVICE_PROVIDER } from './coin-provider.interface';
import { MockCoinProvider } from './mock-coin.provider';

describe('TowerReconciliationService (Automated Failure Recovery)', () => {
  let service: TowerReconciliationService;
  let mockProvider: MockCoinProvider;

  const mockPrisma = {
    towerRewardTransaction: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    mockProvider = new MockCoinProvider();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TowerReconciliationService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: COIN_SERVICE_PROVIDER,
          useValue: mockProvider,
        },
      ],
    }).compile();

    service = module.get<TowerReconciliationService>(TowerReconciliationService);
  });

  it('reconciles UNKNOWN transaction to SUCCESS when provider confirms external credit', async () => {
    const txIdempotencyKey = 'tower:season:2026-11:user:u1:floor:2';

    // Provider has record
    await mockProvider.creditReward({
      userId: 'u1',
      amount: 1,
      idempotencyKey: txIdempotencyKey,
      metadata: { seasonKey: '2026-11', floor: 2 },
    });

    mockPrisma.towerRewardTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-unknown-1',
        idempotencyKey: txIdempotencyKey,
        status: 'UNKNOWN',
        retryCount: 1,
        createdAt: new Date(Date.now() - 60000),
      },
    ]);
    mockPrisma.towerRewardTransaction.update.mockResolvedValue({});

    const summary = await service.reconcilePendingAndUnknown();

    expect(summary.reconciledSuccess).toBe(1);
    expect(mockPrisma.towerRewardTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-unknown-1' },
        data: expect.objectContaining({
          status: 'SUCCESS',
        }),
      }),
    );
  });

  it('re-dispatches safely when provider returns NOT_FOUND', async () => {
    const txIdempotencyKey = 'tower:season:2026-11:user:u2:floor:4';

    mockPrisma.towerRewardTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-lost-1',
        idempotencyKey: txIdempotencyKey,
        status: 'UNKNOWN',
        retryCount: 1,
        createdAt: new Date(Date.now() - 60000),
        requestPayload: {
          userId: 'u2',
          amount: 1,
          idempotencyKey: txIdempotencyKey,
          metadata: { seasonKey: '2026-11', floor: 4 },
        },
      },
    ]);
    mockPrisma.towerRewardTransaction.update.mockResolvedValue({});

    const summary = await service.reconcilePendingAndUnknown();

    expect(summary.reconciledSuccess).toBe(1);
    // After re-dispatching, provider now holds record
    expect(mockProvider.getRecord(txIdempotencyKey)?.status).toBe('SUCCESS');
  });
});
