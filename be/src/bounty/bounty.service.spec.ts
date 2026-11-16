import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BountyAssignmentStatus,
  BountyCategory,
  BountyStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { XpService } from '../xp/xp.service';
import { BountyRewardService } from './bounty-reward.service';
import { BountyService } from './bounty.service';
import { BOUNTY_COIN_SERVICE_PROVIDER } from './coin/coin-provider.interface';
import { MockBountyCoinProvider } from './coin/mock-bounty-coin.provider';

describe('BountyService', () => {
  let service: BountyService;
  let rewardService: BountyRewardService;

  const mockBounty = {
    id: 'bounty_123',
    slug: 'dark-mode-audio-fx',
    title: 'Tích hợp Dark Mode & Audio FX',
    description: 'Xây dựng toggle Dark Theme',
    category: BountyCategory.WEB,
    difficulty: 3,
    rewardCoins: 450,
    rewardXp: 150,
    durationMinutes: 180,
    clientName: 'Alex Rivera',
    clientRole: 'Lead Game Producer',
    clientCompany: 'CyberForge',
    clientAvatarUrl: 'https://example.com/avatar.jpg',
    clientNotes: 'Cần mượt mà',
    deliverableType: 'URL',
    tasks: [],
    skills: ['React', 'TypeScript'],
    status: BountyStatus.OPEN,
    maxParticipants: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    bounty: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    bountyAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    bountyRewardTransaction: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    notification: {
      createManyAndReturn: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockImplementation((cb) => cb(mockPrisma)),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const mockXpService = {
    award: jest.fn().mockResolvedValue({ awarded: true, amount: 150 }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BountyService,
        BountyRewardService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: XpService,
          useValue: mockXpService,
        },
        {
          provide: BOUNTY_COIN_SERVICE_PROVIDER,
          useClass: MockBountyCoinProvider,
        },
      ],
    }).compile();

    service = module.get<BountyService>(BountyService);
    rewardService = module.get<BountyRewardService>(BountyRewardService);
  });

  describe('listBounties', () => {
    it('returns bounties and indicates lock status when user has an active quest', async () => {
      mockPrisma.bountyAssignment.findFirst.mockResolvedValue({
        id: 'assign_1',
        bountyId: 'bounty_123',
        status: BountyAssignmentStatus.IN_PROGRESS,
        expiresAt: new Date(Date.now() + 100000),
      });

      mockPrisma.bounty.findMany.mockResolvedValue([mockBounty]);

      const res = await service.listBounties('user_1');

      expect(res.isLockedByActiveQuest).toBe(true);
      expect(res.bounties[0].isCurrentlyActive).toBe(true);
    });

    it('returns isLockedByActiveQuest: false when user has no active quest', async () => {
      mockPrisma.bountyAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.bounty.findMany.mockResolvedValue([mockBounty]);

      const res = await service.listBounties('user_1');

      expect(res.isLockedByActiveQuest).toBe(false);
      expect(res.bounties[0].isCurrentlyActive).toBe(false);
    });
  });

  describe('acceptBounty', () => {
    it('accepts bounty and sets expiresAt correctly when user has no active quest', async () => {
      mockPrisma.bountyAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.bounty.findUnique.mockResolvedValue(mockBounty);
      mockPrisma.bountyAssignment.create.mockImplementation(({ data }) => ({
        id: 'assign_new',
        ...data,
      }));

      const res = await service.acceptBounty('user_1', 'bounty_123');

      expect(res.status).toBe(BountyAssignmentStatus.IN_PROGRESS);
      expect(res.bountyId).toBe('bounty_123');
      expect(mockPrisma.bountyAssignment.create).toHaveBeenCalled();
    });

    it('throws BadRequestException if user has already completed this bounty (anti-farming)', async () => {
      mockPrisma.bountyAssignment.findFirst.mockResolvedValueOnce({
        id: 'assign_completed',
        bountyId: 'bounty_123',
        status: BountyAssignmentStatus.APPROVED,
      });

      await expect(
        service.acceptBounty('user_1', 'bounty_123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if user already has an active quest (INV1)', async () => {
      mockPrisma.bountyAssignment.findFirst
        .mockResolvedValueOnce(null) // anti-farming check passes
        .mockResolvedValueOnce({
          id: 'assign_existing',
          bountyId: 'bounty_999',
          status: BountyAssignmentStatus.IN_PROGRESS,
          expiresAt: new Date(Date.now() + 100000),
        });

      await expect(
        service.acceptBounty('user_1', 'bounty_123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitBounty', () => {
    it('submits deliverable URL, transitions to SUBMITTED and sends notifications (no immediate auto-reward)', async () => {
      const activeAssign = {
        id: 'assign_1',
        userId: 'user_1',
        bountyId: 'bounty_123',
        status: BountyAssignmentStatus.IN_PROGRESS,
        expiresAt: new Date(Date.now() + 100000),
        bounty: mockBounty,
      };

      mockPrisma.bountyAssignment.findFirst.mockResolvedValue(activeAssign);
      mockPrisma.bountyAssignment.update.mockResolvedValue({
        ...activeAssign,
        status: BountyAssignmentStatus.SUBMITTED,
        projectUrl: 'https://github.com/bcn/test-repo',
      });
      mockPrisma.bountyAssignment.findMany.mockResolvedValue([
        { reviewedBy: 'reviewer_1' },
      ]);

      const res = await service.submitBounty('user_1', 'bounty_123', {
        projectUrl: 'https://github.com/bcn/test-repo',
      });

      expect(res.assignment.status).toBe(BountyAssignmentStatus.SUBMITTED);
      expect(mockXpService.award).not.toHaveBeenCalled();
      expect(mockPrisma.notification.createManyAndReturn).toHaveBeenCalled();
    });

    it('marks quest as EXPIRED and rejects submission if deadline passed (INV3)', async () => {
      const expiredAssign = {
        id: 'assign_expired',
        userId: 'user_1',
        bountyId: 'bounty_123',
        status: BountyAssignmentStatus.IN_PROGRESS,
        expiresAt: new Date(Date.now() - 1000), // in the past
        bounty: mockBounty,
      };

      mockPrisma.bountyAssignment.findFirst.mockResolvedValue(expiredAssign);

      await expect(
        service.submitBounty('user_1', 'bounty_123', {
          projectUrl: 'https://github.com/bcn/test',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.bountyAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: BountyAssignmentStatus.EXPIRED },
        }),
      );
    });
  });

  describe('abandonBounty', () => {
    it('sets assignment to ABANDONED so user can accept another quest', async () => {
      mockPrisma.bountyAssignment.findFirst.mockResolvedValue({
        id: 'assign_1',
        bountyId: 'bounty_123',
        status: BountyAssignmentStatus.IN_PROGRESS,
      });

      mockPrisma.bountyAssignment.update.mockResolvedValue({
        id: 'assign_1',
        status: BountyAssignmentStatus.ABANDONED,
      });

      const res = await service.abandonBounty('user_1', 'bounty_123');
      expect(res.success).toBe(true);
      expect(res.assignment.status).toBe(BountyAssignmentStatus.ABANDONED);
    });
  });

  describe('reviewSubmission', () => {
    it('throws BadRequestException when assignment is not in SUBMITTED status', async () => {
      mockPrisma.bountyAssignment.findUnique.mockResolvedValue({
        id: 'assign_1',
        status: BountyAssignmentStatus.IN_PROGRESS,
        bounty: mockBounty,
      });

      await expect(
        service.reviewSubmission('assign_1', 'admin_1', 'APPROVED'),
      ).rejects.toThrow(BadRequestException);
    });

    it('approves submitted assignment without immediately rewarding coins/XP, and notifies user', async () => {
      mockPrisma.bountyAssignment.findUnique.mockResolvedValue({
        id: 'assign_1',
        userId: 'user_1',
        bountyId: 'bounty_123',
        status: BountyAssignmentStatus.SUBMITTED,
        bounty: mockBounty,
      });

      mockPrisma.bountyAssignment.update.mockResolvedValue({
        id: 'assign_1',
        userId: 'user_1',
        bountyId: 'bounty_123',
        status: BountyAssignmentStatus.APPROVED,
        reviewedBy: 'admin_1',
        bounty: mockBounty,
      });

      const res = await service.reviewSubmission(
        'assign_1',
        'admin_1',
        'APPROVED',
        'Tốt lắm!',
      );

      expect(res.status).toBe(BountyAssignmentStatus.APPROVED);
      // Coins and XP should NOT be awarded yet upon review approval
      expect(mockXpService.award).not.toHaveBeenCalled();
      expect(mockPrisma.notification.createManyAndReturn).toHaveBeenCalled();
    });

    it('rejects submitted assignment, saves feedback and notifies user', async () => {
      mockPrisma.bountyAssignment.findUnique.mockResolvedValue({
        id: 'assign_1',
        userId: 'user_1',
        bountyId: 'bounty_123',
        status: BountyAssignmentStatus.SUBMITTED,
        bounty: mockBounty,
      });

      mockPrisma.bountyAssignment.update.mockResolvedValue({
        id: 'assign_1',
        userId: 'user_1',
        bountyId: 'bounty_123',
        status: BountyAssignmentStatus.REJECTED,
        reviewFeedback: 'Thiếu responsive',
        bounty: mockBounty,
      });

      const res = await service.reviewSubmission(
        'assign_1',
        'admin_1',
        'REJECTED',
        'Thiếu responsive',
      );

      expect(res.status).toBe(BountyAssignmentStatus.REJECTED);
      expect(mockXpService.award).not.toHaveBeenCalled();
      expect(mockPrisma.notification.createManyAndReturn).toHaveBeenCalled();
    });
  });

  describe('claimReward', () => {
    it('claims reward for approved assignment, awards coins/XP and sends notification', async () => {
      mockPrisma.bountyAssignment.findUnique.mockResolvedValue({
        id: 'assign_1',
        userId: 'user_1',
        bountyId: 'bounty_123',
        status: BountyAssignmentStatus.APPROVED,
        bounty: mockBounty,
        transaction: null,
      });

      mockPrisma.bountyRewardTransaction.findUnique.mockResolvedValue(null);
      mockPrisma.bountyRewardTransaction.create.mockResolvedValue({
        id: 'tx_1',
        status: 'PENDING',
      });
      mockPrisma.bountyRewardTransaction.update.mockResolvedValue({
        id: 'tx_1',
        status: 'COMPLETED',
      });

      const res = await service.claimReward('user_1', 'assign_1');

      expect(res.success).toBe(true);
      expect(res.rewardCoins).toBe(450);
      expect(res.rewardXp).toBe(150);
      expect(mockXpService.award).toHaveBeenCalledWith(
        'user_1',
        'BOUNTY_COMPLETED',
        'assign_1',
        undefined,
        150,
      );
      expect(mockPrisma.notification.createManyAndReturn).toHaveBeenCalled();
    });

    it('throws BadRequestException if assignment is not APPROVED', async () => {
      mockPrisma.bountyAssignment.findUnique.mockResolvedValue({
        id: 'assign_1',
        userId: 'user_1',
        bountyId: 'bounty_123',
        status: BountyAssignmentStatus.SUBMITTED,
        bounty: mockBounty,
      });

      await expect(service.claimReward('user_1', 'assign_1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if reward has already been claimed', async () => {
      mockPrisma.bountyAssignment.findUnique.mockResolvedValue({
        id: 'assign_1',
        userId: 'user_1',
        bountyId: 'bounty_123',
        status: BountyAssignmentStatus.APPROVED,
        bounty: mockBounty,
        transaction: {
          id: 'tx_1',
          status: 'COMPLETED',
        },
      });

      await expect(service.claimReward('user_1', 'assign_1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('listAllBounties & deleteBounty', () => {
    it('listAllBounties fetches bounties with assignment counts', async () => {
      mockPrisma.bounty.findMany.mockResolvedValue([
        { ...mockBounty, _count: { assignments: 2 } },
      ]);
      const res = await service.listAllBounties();
      expect(res).toHaveLength(1);
      expect(mockPrisma.bounty.findMany).toHaveBeenCalled();
    });

    it('deleteBounty archives bounty when assignments exist', async () => {
      mockPrisma.bounty.findUnique.mockResolvedValue({
        ...mockBounty,
        _count: { assignments: 3 },
      });
      mockPrisma.bounty.update.mockResolvedValue({
        ...mockBounty,
        status: BountyStatus.CLOSED,
      });

      const res = await service.deleteBounty('bounty_123');
      expect(res.status).toBe(BountyStatus.CLOSED);
      expect(mockPrisma.bounty.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: BountyStatus.CLOSED } }),
      );
      expect(mockPrisma.bounty.delete).not.toHaveBeenCalled();
    });

    it('deleteBounty deletes bounty when no assignments exist', async () => {
      mockPrisma.bounty.findUnique.mockResolvedValue({
        ...mockBounty,
        _count: { assignments: 0 },
      });
      mockPrisma.bounty.delete.mockResolvedValue(mockBounty);

      const res = await service.deleteBounty('bounty_123');
      expect(res.id).toBe('bounty_123');
      expect(mockPrisma.bounty.delete).toHaveBeenCalledWith({
        where: { id: 'bounty_123' },
      });
    });
  });

  describe('BountyRewardService (Idempotency INV2)', () => {
    it('returns existing completed transaction without re-crediting', async () => {
      mockPrisma.bountyRewardTransaction.findUnique.mockResolvedValue({
        id: 'tx_existing',
        assignmentId: 'assign_1',
        status: 'COMPLETED',
        externalTxId: 'tx_orig',
      });

      const res = await rewardService.rewardAssignmentCompletion(
        'assign_1',
        'user_1',
        'bounty_123',
        450,
        150,
      );

      expect(res.status).toBe('COMPLETED');
      expect(mockPrisma.bountyRewardTransaction.create).not.toHaveBeenCalled();
    });
  });
});
