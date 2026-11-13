import { Test, TestingModule } from '@nestjs/testing';
import { TowerCoinService } from './tower-coin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { COIN_SERVICE_PROVIDER } from './coin-provider.interface';
import { MockCoinProvider } from './mock-coin.provider';

describe('TowerCoinService (Idempotency, Safety & Resilience)', () => {
  let service: TowerCoinService;
  let mockProvider: MockCoinProvider;

  const mockPrisma = {
    towerRewardTransaction: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    mockProvider = new MockCoinProvider();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TowerCoinService,
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

    service = module.get<TowerCoinService>(TowerCoinService);
  });

  it('INV1 & INV2: successfully initiates and credits 1 coin with unique idempotency key', async () => {
    mockPrisma.towerRewardTransaction.findUnique.mockResolvedValue(null);
    mockPrisma.towerRewardTransaction.create.mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      seasonId: 'season-1',
      floor: 1,
      rewardCoins: 1,
      idempotencyKey: 'tower:season:2026-11:user:user-1:floor:1',
      status: 'PENDING',
    });
    mockPrisma.towerRewardTransaction.update.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'tx-1',
        status: data.status,
        externalTxId: data.externalTxId,
      }),
    );

    const result = await service.rewardFloorCompletion(
      'user-1',
      'season-1',
      '2026-11',
      1,
    );

    expect(result.status).toBe('SUCCESS');
    expect(mockPrisma.towerRewardTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rewardCoins: 1, // Fixed: 1 coin
          idempotencyKey: 'tower:season:2026-11:user:user-1:floor:1',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('INV5: transitions to UNKNOWN when external coin provider times out (does NOT mark as FAILED)', async () => {
    mockPrisma.towerRewardTransaction.findUnique.mockResolvedValue(null);
    mockPrisma.towerRewardTransaction.create.mockResolvedValue({
      id: 'tx-timeout',
      userId: 'user-1',
      seasonId: 'season-1',
      floor: 5,
      idempotencyKey: 'tower:season:2026-11:user:user-1:floor:5',
      status: 'PENDING',
    });
    mockPrisma.towerRewardTransaction.update.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'tx-timeout',
        status: data.status,
        errorMessage: data.errorMessage,
      }),
    );

    // Simulate Gateway Timeout
    mockProvider.nextOutcomeOverride = 'TIMEOUT';

    const result = await service.rewardFloorCompletion(
      'user-1',
      'season-1',
      '2026-11',
      5,
    );

    expect(result.status).toBe('UNKNOWN');
    expect(result.errorMessage).toContain('Gateway Timeout');
    expect(mockPrisma.towerRewardTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'UNKNOWN',
        }),
      }),
    );
  });

  it('INV1: returns existing transaction if already rewarded for this floor', async () => {
    const existingTx = {
      id: 'tx-existing',
      userId: 'user-1',
      seasonId: 'season-1',
      floor: 3,
      rewardCoins: 1,
      status: 'SUCCESS',
      idempotencyKey: 'tower:season:2026-11:user:user-1:floor:3',
    };
    mockPrisma.towerRewardTransaction.findUnique.mockResolvedValue(existingTx);

    const result = await service.rewardFloorCompletion(
      'user-1',
      'season-1',
      '2026-11',
      3,
    );

    expect(result).toEqual(existingTx);
    expect(mockPrisma.towerRewardTransaction.create).not.toHaveBeenCalled();
  });
});
