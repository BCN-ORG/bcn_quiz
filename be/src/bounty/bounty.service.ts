import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import {
  BountyAssignmentStatus,
  BountyCategory,
  BountyRewardStatus,
  BountyStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { NotificationService } from '../notification/notification.service';
import { BountyRewardService } from './bounty-reward.service';
import {
  CreateBountyDto,
  QueryBountiesDto,
  SubmitBountyDto,
} from './dto/bounty.dto';

@Injectable()
export class BountyService implements OnModuleInit {
  private readonly logger = new Logger(BountyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rewardService: BountyRewardService,
    @Optional() private readonly notificationService?: NotificationService,
    @Optional() private readonly profilesService?: ProfilesService,
  ) {}

  async onModuleInit() {
    await this.seedInitialBountiesIfEmpty();
  }

  /**
   * Returns list of bounties with user locked-state context.
   */
  async listBounties(userId?: string, query?: QueryBountiesDto) {
    let activeAssignment = null;

    if (userId) {
      activeAssignment = await this.getActiveBounty(userId);
    }

    const where: {
      status: BountyStatus;
      category?: BountyCategory;
    } = {
      status: BountyStatus.OPEN,
    };

    if (query?.category) {
      where.category = query.category;
    }

    const bounties = await this.prisma.bounty.findMany({
      where,
      orderBy: [{ difficulty: 'asc' }, { createdAt: 'desc' }],
    });

    const isLockedByActiveQuest = Boolean(activeAssignment);

    return {
      activeAssignment,
      isLockedByActiveQuest,
      bounties: bounties.map((b) => ({
        ...b,
        isCurrentlyActive: activeAssignment?.bountyId === b.id,
      })),
    };
  }

  /**
   * Retrieves the currently active bounty for a user.
   * Auto-expires if deadline has passed.
   */
  async getActiveBounty(userId: string) {
    const assignment = await this.prisma.bountyAssignment.findFirst({
      where: {
        userId,
        status: {
          in: [
            BountyAssignmentStatus.IN_PROGRESS,
            BountyAssignmentStatus.SUBMITTED,
          ],
        },
      },
      include: {
        bounty: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!assignment) {
      return null;
    }

    // Auto-expire check
    if (
      assignment.status === BountyAssignmentStatus.IN_PROGRESS &&
      new Date() > assignment.expiresAt
    ) {
      await this.prisma.bountyAssignment.update({
        where: { id: assignment.id },
        data: { status: BountyAssignmentStatus.EXPIRED },
      });
      return null;
    }

    return assignment;
  }

  /**
   * Overview metrics for the hero banner.
   */
  async getStats(userId?: string) {
    const [openCount, allBounties, userCompletedCount] = await Promise.all([
      this.prisma.bounty.count({
        where: { status: BountyStatus.OPEN },
      }),
      this.prisma.bounty.findMany({
        where: { status: BountyStatus.OPEN },
        select: { rewardCoins: true },
      }),
      userId
        ? this.prisma.bountyAssignment.count({
            where: {
              userId,
              status: BountyAssignmentStatus.APPROVED,
            },
          })
        : 0,
    ]);

    const totalRewardPool = allBounties.reduce(
      (sum, b) => sum + b.rewardCoins,
      0,
    );

    return {
      openCount,
      totalRewardPool,
      userCompletedCount,
    };
  }

  /**
   * Accepts a bounty. Enforces SINGLE ACTIVE QUEST policy with anti-farming & advisory lock.
   */
  async acceptBounty(userId: string, bountyId: string) {
    // 1. Anti-farming check: cannot accept a bounty already completed and rewarded
    const alreadyCompleted = await this.prisma.bountyAssignment.findFirst({
      where: {
        userId,
        bountyId,
        status: BountyAssignmentStatus.APPROVED,
      },
    });
    if (alreadyCompleted) {
      throw new BadRequestException(
        'Bạn đã hoàn thành nhiệm vụ này và nhận thưởng rồi! Hãy thử sức với nhiệm vụ khác.',
      );
    }

    // 2. Transaction with advisory lock to strictly prevent race conditions
    return this.prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'bounty:accept:' + userId}))`;

        const existingActive = await tx.bountyAssignment.findFirst({
          where: {
            userId,
            status: {
              in: [
                BountyAssignmentStatus.IN_PROGRESS,
                BountyAssignmentStatus.SUBMITTED,
              ],
            },
          },
        });

        if (existingActive) {
          throw new BadRequestException(
            'Đang làm một job thì các job khác sẽ tạm khóa — hãy tập trung hoàn thành hoặc hủy nhiệm vụ hiện tại!',
          );
        }

        const bounty = await tx.bounty.findUnique({
          where: { id: bountyId },
        });

        if (!bounty || bounty.status !== BountyStatus.OPEN) {
          throw new NotFoundException('Nhiệm vụ không tồn tại hoặc đã đóng.');
        }

        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + bounty.durationMinutes * 60 * 1000,
        );

        return tx.bountyAssignment.create({
          data: {
            userId,
            bountyId,
            status: BountyAssignmentStatus.IN_PROGRESS,
            acceptedAt: now,
            expiresAt,
          },
          include: {
            bounty: true,
          },
        });
      })
      .catch((err: unknown) => {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new BadRequestException(
            'Đang làm một job thì các job khác sẽ tạm khóa — hãy tập trung hoàn thành hoặc hủy nhiệm vụ hiện tại!',
          );
        }
        throw err;
      });
  }

  /**
   * Submits project deliverable URL and triggers review.
   */
  async submitBounty(userId: string, bountyId: string, dto: SubmitBountyDto) {
    const assignment = await this.prisma.bountyAssignment.findFirst({
      where: {
        userId,
        bountyId,
        status: BountyAssignmentStatus.IN_PROGRESS,
      },
      include: {
        bounty: true,
      },
    });

    if (!assignment) {
      throw new BadRequestException(
        'Không tìm thấy nhiệm vụ đang thực hiện cho người dùng.',
      );
    }

    const now = new Date();
    if (now > assignment.expiresAt) {
      await this.prisma.bountyAssignment.update({
        where: { id: assignment.id },
        data: { status: BountyAssignmentStatus.EXPIRED },
      });
      throw new BadRequestException(
        'Nhiệm vụ đã hết hạn làm bài! Vui lòng nhận nhiệm vụ mới.',
      );
    }

    // Status transitions to BountyAssignmentStatus.SUBMITTED upon submission (no immediate auto-reward)
    const submitted = await this.prisma.bountyAssignment.update({
      where: { id: assignment.id },
      data: {
        projectUrl: dto.projectUrl,
        submissionNotes: dto.submissionNotes || null,
        submittedAt: now,
        status: BountyAssignmentStatus.SUBMITTED,
      },
      include: {
        bounty: true,
      },
    });

    // Notify user: 'Nhiệm vụ {title} đã nộp thành công và đang chờ mentor/admin duyệt.' (type: BOUNTY_SUBMITTED)
    await this.notify(
      userId,
      NotificationType.BOUNTY_SUBMITTED,
      'Nộp nhiệm vụ thành công',
      `Nhiệm vụ ${assignment.bounty.title} đã nộp thành công và đang chờ mentor/admin duyệt.`,
      `bounty-submitted:${assignment.id}:${now.getTime()}`,
    );

    // Notify mentors/admins: find distinct reviewerIds from past submissions or admin users and send notification
    try {
      const pastReviewers = await this.prisma.bountyAssignment.findMany({
        where: { reviewedBy: { not: null } },
        select: { reviewedBy: true },
        distinct: ['reviewedBy'],
      });
      const reviewerIds = new Set<string>();
      for (const r of pastReviewers) {
        if (
          r.reviewedBy &&
          r.reviewedBy !== 'SYSTEM' &&
          r.reviewedBy !== userId
        ) {
          reviewerIds.add(r.reviewedBy);
        }
      }
      if (reviewerIds.size === 0) {
        reviewerIds.add('admin');
      }
      await this.notifyMany(
        Array.from(reviewerIds),
        NotificationType.BOUNTY_SUBMITTED,
        'Duyệt nhiệm vụ mới',
        `Học viên đã nộp dự án cho nhiệm vụ ${assignment.bounty.title}. Vui lòng kiểm tra và duyệt.`,
        `bounty-submission-mentor:${assignment.id}:${now.getTime()}`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to notify reviewers for assignment ${assignment.id}: ${err}`,
      );
    }

    return {
      assignment: submitted,
      message: `Nhiệm vụ ${assignment.bounty.title} đã nộp thành công và đang chờ mentor/admin duyệt.`,
    };
  }

  /**
   * User abandons the active quest.
   */
  async abandonBounty(userId: string, bountyId: string) {
    const assignment = await this.prisma.bountyAssignment.findFirst({
      where: {
        userId,
        bountyId,
        status: BountyAssignmentStatus.IN_PROGRESS,
      },
    });

    if (!assignment) {
      throw new BadRequestException('Không tìm thấy nhiệm vụ để hủy.');
    }

    const updated = await this.prisma.bountyAssignment.update({
      where: { id: assignment.id },
      data: {
        status: BountyAssignmentStatus.ABANDONED,
      },
    });

    return {
      success: true,
      message: 'Đã hủy nhiệm vụ thành công.',
      assignment: updated,
    };
  }

  /**
   * History of past bounties for this user.
   */
  async getHistory(userId: string) {
    return this.prisma.bountyAssignment.findMany({
      where: {
        userId,
        status: {
          in: [
            BountyAssignmentStatus.APPROVED,
            BountyAssignmentStatus.REJECTED,
            BountyAssignmentStatus.ABANDONED,
            BountyAssignmentStatus.EXPIRED,
          ],
        },
      },
      include: {
        bounty: true,
        transaction: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Admin/Mentor creates a new bounty.
   */
  async createBounty(dto: CreateBountyDto) {
    const slug = `${dto.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;

    return this.prisma.bounty.create({
      data: {
        slug,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        difficulty: dto.difficulty,
        rewardCoins: dto.rewardCoins,
        rewardXp: dto.rewardXp,
        durationMinutes: dto.durationMinutes,
        clientName: dto.clientName,
        clientRole: dto.clientRole,
        clientCompany: dto.clientCompany,
        clientAvatarUrl: dto.clientAvatarUrl,
        clientNotes: dto.clientNotes,
        deliverableType: dto.deliverableType || 'URL',
        tasks: dto.tasks || [],
        skills: dto.skills || [],
        maxParticipants: dto.maxParticipants || 0,
      },
    });
  }

  /**
   * Admin/Mentor manual review.
   */
  async reviewSubmission(
    assignmentId: string,
    reviewerId: string,
    status: 'APPROVED' | 'REJECTED',
    feedback?: string,
  ) {
    const assignment = await this.prisma.bountyAssignment.findUnique({
      where: { id: assignmentId },
      include: { bounty: true },
    });

    if (!assignment) {
      throw new NotFoundException('Không tìm thấy bài nộp.');
    }

    if (assignment.status !== BountyAssignmentStatus.SUBMITTED) {
      throw new BadRequestException(
        `Không thể chấm bài ở trạng thái ${assignment.status}. Chỉ bài nộp SUBMITTED mới được duyệt.`,
      );
    }

    const now = new Date();
    const updated = await this.prisma.bountyAssignment.update({
      where: { id: assignmentId },
      data: {
        status:
          status === 'APPROVED'
            ? BountyAssignmentStatus.APPROVED
            : BountyAssignmentStatus.REJECTED,
        reviewedAt: now,
        reviewedBy: reviewerId,
        reviewFeedback: feedback || null,
      },
      include: { bounty: true },
    });

    if (status === 'APPROVED') {
      // DO NOT reward coins/xp yet! Notify user: 'Nhiệm vụ {title} của bạn đã được phê duyệt! Hãy bấm nút "Nhận thưởng" để nhận {rewardCoins} coins và {rewardXp} XP.' (type: BOUNTY_APPROVED).
      await this.notify(
        updated.userId,
        NotificationType.BOUNTY_APPROVED,
        'Nhiệm vụ được phê duyệt',
        `Nhiệm vụ ${updated.bounty.title} của bạn đã được phê duyệt! Hãy bấm nút "Nhận thưởng" để nhận ${updated.bounty.rewardCoins} coins và ${updated.bounty.rewardXp} XP.`,
        `bounty-approved:${updated.id}`,
      );
    } else {
      // When reviewer rejects: set status to REJECTED, save feedback. Notify user: 'Nhiệm vụ {title} chưa đạt yêu cầu: {feedback}' (type: BOUNTY_REJECTED).
      await this.notify(
        updated.userId,
        NotificationType.BOUNTY_REJECTED,
        'Nhiệm vụ chưa đạt yêu cầu',
        `Nhiệm vụ ${updated.bounty.title} chưa đạt yêu cầu: ${feedback || 'Vui lòng kiểm tra lại yêu cầu bài nộp.'}`,
        `bounty-rejected:${updated.id}:${now.getTime()}`,
      );
    }

    return updated;
  }

  /**
   * User claims reward for an approved bounty.
   */
  async claimReward(userId: string, assignmentId: string) {
    const assignment = await this.prisma.bountyAssignment.findUnique({
      where: { id: assignmentId },
      include: { bounty: true, transaction: true },
    });

    if (!assignment || assignment.userId !== userId) {
      throw new NotFoundException('Không tìm thấy nhiệm vụ của người dùng.');
    }

    if (assignment.status !== BountyAssignmentStatus.APPROVED) {
      throw new BadRequestException(
        'Chỉ nhiệm vụ đã được phê duyệt mới có thể nhận thưởng.',
      );
    }

    if (
      assignment.transaction &&
      assignment.transaction.status === BountyRewardStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Phần thưởng cho nhiệm vụ này đã được nhận trước đó.',
      );
    }

    await this.rewardService.rewardAssignmentCompletion(
      assignment.id,
      userId,
      assignment.bountyId,
      assignment.bounty.rewardCoins,
      assignment.bounty.rewardXp,
      { slug: assignment.bounty.slug, title: assignment.bounty.title },
    );

    // Notify user: 'Bạn đã nhận thành công {rewardCoins} coins và {rewardXp} XP từ nhiệm vụ {title}!' (type: BOUNTY_CLAIMED).
    await this.notify(
      userId,
      NotificationType.BOUNTY_CLAIMED,
      'Nhận thưởng thành công',
      `Bạn đã nhận thành công ${assignment.bounty.rewardCoins} coins và ${assignment.bounty.rewardXp} XP từ nhiệm vụ ${assignment.bounty.title}!`,
      `bounty-claimed:${assignment.id}`,
    );

    return {
      success: true,
      rewardCoins: assignment.bounty.rewardCoins,
      rewardXp: assignment.bounty.rewardXp,
      assignment,
    };
  }

  /**
   * Admin updates a bounty.
   */
  async updateBounty(id: string, dto: Partial<CreateBountyDto>) {
    return this.prisma.bounty.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Admin lists all bounties across all statuses (OPEN, CLOSED, etc.).
   */
  async listAllBounties(status?: BountyStatus) {
    const where = status ? { status } : {};
    return this.prisma.bounty.findMany({
      where,
      include: {
        _count: {
          select: { assignments: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  /**
   * Admin deletes or archives a bounty.
   */
  async deleteBounty(id: string) {
    const bounty = await this.prisma.bounty.findUnique({
      where: { id },
      include: { _count: { select: { assignments: true } } },
    });

    if (!bounty) {
      throw new NotFoundException('Không tìm thấy nhiệm vụ.');
    }

    if (bounty._count.assignments > 0) {
      // Archive if assignments exist to prevent foreign key errors
      return this.prisma.bounty.update({
        where: { id },
        data: { status: BountyStatus.CLOSED },
      });
    }

    return this.prisma.bounty.delete({
      where: { id },
    });
  }

  /**
   * Admin lists submissions.
   */
  async listSubmissions(status?: BountyAssignmentStatus) {
    const rows = await this.prisma.bountyAssignment.findMany({
      where: {
        status: status || BountyAssignmentStatus.SUBMITTED,
      },
      include: { bounty: true },
      orderBy: { submittedAt: 'desc' },
    });

    const userIds = Array.from(
      new Set(rows.map((r) => r.userId).filter(Boolean)),
    );
    let userMap = new Map<
      string,
      {
        id: string;
        fullName: string | null;
        email: string;
        avatarUrl: string | null;
      }
    >();

    if (this.profilesService && userIds.length > 0) {
      try {
        userMap = await this.profilesService.resolveUsers(userIds);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[BountyService] Could not resolve submitter profiles: ${msg}`,
        );
      }
    }

    return rows.map((row) => {
      const profile = userMap.get(row.userId);
      return {
        ...row,
        user: profile
          ? {
              id: profile.id,
              fullName: profile.fullName,
              email: profile.email,
              avatarUrl: profile.avatarUrl,
            }
          : null,
      };
    });
  }

  /**
   * Seed rich initial bounties and sample submissions if empty.
   */
  async seedInitialBountiesIfEmpty() {
    try {
      const initialBounties: Array<{
        slug: string;
        title: string;
        description: string;
        category: BountyCategory;
        difficulty: number;
        rewardCoins: number;
        rewardXp: number;
        durationMinutes: number;
        clientName: string;
        clientRole: string;
        clientCompany: string;
        clientAvatarUrl: string;
        clientNotes: string;
        deliverableType: string;
        tasks: Array<{ id: number; text: string; done?: boolean }>;
        skills: string[];
      }> = [
        {
          slug: 'dark-mode-audio-fx-daily-tower',
          title: 'Tích hợp Dark Mode & Audio FX cho Leo Tháp',
          description:
            'Xây dựng toggle Dark Theme với màu sắc Neon RPG chuẩn phong cách Game Arena và bổ sung hiệu ứng âm thanh Web Audio API khi trả lời đúng / sai.',
          category: BountyCategory.WEB,
          difficulty: 3,
          rewardCoins: 6,
          rewardXp: 150,
          durationMinutes: 180,
          clientName: 'Alex Rivera',
          clientRole: 'Lead Game Producer',
          clientCompany: 'CyberForge Interactive',
          clientAvatarUrl:
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          clientNotes:
            'Chúng tôi cần trải nghiệm ban đêm phải thật sự cuốn hút! Học viên chơi vào buổi tối không bị mỏi mắt mà vẫn giữ được độ rực của các hiệu ứng combo.',
          deliverableType: 'URL',
          tasks: [
            {
              id: 1,
              text: 'Thiết kế palette màu dark theme CSS variables',
              done: false,
            },
            {
              id: 2,
              text: 'Tích hợp Web Audio API cho âm thanh trả lời đúng',
              done: false,
            },
            {
              id: 3,
              text: 'Thêm hiệu ứng rung haptic hoặc animation khi combo x5',
              done: false,
            },
            {
              id: 4,
              text: 'Kiểm tra độ tương phản a11y theo chuẩn WCAG AA',
              done: false,
            },
          ],
          skills: ['React', 'TailwindCSS', 'Web Audio API', 'TypeScript'],
        },
        {
          slug: 'boss-battle-canvas-hud',
          title: 'HUD Chiến Đấu Boss Battle bằng Canvas / SVG',
          description:
            'Tạo thanh máu Boss tương tác đa tầng (shield layer, bleed effect, combo visual multiplier) và hiệu ứng chém chớp khi người chơi gây sát thương chí mạng.',
          category: BountyCategory.GAME,
          difficulty: 4,
          rewardCoins: 8,
          rewardXp: 220,
          durationMinutes: 240,
          clientName: 'Kenji Sato',
          clientRole: 'Technical Art Director',
          clientCompany: 'NeoTokyo Studios',
          clientAvatarUrl:
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
          clientNotes:
            'Cần animation mượt mà 60fps trên cả mobile. Hãy dùng requestAnimationFrame và hạn chế tối đa layout thrashing.',
          deliverableType: 'URL',
          tasks: [
            {
              id: 1,
              text: 'Vẽ Boss HP bar đa tầng với SVG gradient',
              done: false,
            },
            {
              id: 2,
              text: 'Tạo hiệu ứng số sát thương nảy lên (Floating Combat Text)',
              done: false,
            },
            {
              id: 3,
              text: 'Hiệu ứng rung màn hình (Screen Shake) khi Boss ra đòn nộ',
              done: false,
            },
          ],
          skills: ['Canvas API', 'SVG', 'CSS Animation', 'TypeScript'],
        },
        {
          slug: 'bcn-profile-hall-of-fame-redesign',
          title: 'Redesign UI Hồ Sơ & Bảng Vinh Danh Học Viên',
          description:
            'Thiết kế giao diện thẻ bài thợ săn Bounty Hunter, hiển thị danh hiệu, cấp độ, huy hiệu thành tích và lịch sử săn boss dạng showcase đẹp mắt.',
          category: BountyCategory.DESIGN,
          difficulty: 2,
          rewardCoins: 5,
          rewardXp: 120,
          durationMinutes: 120,
          clientName: 'Elena Rostova',
          clientRole: 'Principal UX Architect',
          clientCompany: 'PixelCraft Labs',
          clientAvatarUrl:
            'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
          clientNotes:
            'Một thiết kế hiện đại, sạch sẽ nhưng vẫn đậm chất game phiêu lưu kỳ thú. Nộp Figma link đầy đủ Component Auto-layout.',
          deliverableType: 'URL',
          tasks: [
            {
              id: 1,
              text: 'Dựng khung Wireframe cho Profile Card & Badge Showcase',
              done: false,
            },
            {
              id: 2,
              text: 'Thiết kế Hi-Fi Prototype Figma có tương tác hover',
              done: false,
            },
            {
              id: 3,
              text: 'Xuất Design Tokens màu sắc và typography',
              done: false,
            },
          ],
          skills: ['Figma', 'UI/UX Design', 'Design Systems', 'Auto-layout'],
        },
        {
          slug: 'combo-streak-anti-farming-algo',
          title: 'Tối Ưu Thuật Toán Combo Streak & Anti-Farming XP',
          description:
            'Phát triển thuật toán phát hiện bot / click spam câu hỏi trắc nghiệm, tính toán tốc độ phản xạ hợp lý và tính điểm combo thưởng công bằng.',
          category: BountyCategory.AI,
          difficulty: 5,
          rewardCoins: 9,
          rewardXp: 300,
          durationMinutes: 300,
          clientName: 'Marcus Vance',
          clientRole: 'Head of Data Science',
          clientCompany: 'Apex Algorithms',
          clientAvatarUrl:
            'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
          clientNotes:
            'Bài toán yêu cầu xử lý logic time-decay và entropy của chuỗi câu trả lời để ngăn chặn người dùng dùng script tự động.',
          deliverableType: 'URL',
          tasks: [
            {
              id: 1,
              text: 'Xây dựng module phân tích delta thời gian giữa các câu',
              done: false,
            },
            {
              id: 2,
              text: 'Thuật toán trừng phạt (cooldown) khi phát hiện pattern bất thường',
              done: false,
            },
            {
              id: 3,
              text: 'Viết bộ Unit Test kiểm thử 100% case biên',
              done: false,
            },
          ],
          skills: ['Python / NestJS', 'Data Analysis', 'Algorithm', 'Jest'],
        },
        {
          slug: 'mobile-widget-streak-daily-quest',
          title: 'Widget Mobile App Hiển Thị Streak & Nhiệm Vụ',
          description:
            'Xây dựng widget iOS/Android với React Native, hiển thị số ngày streak liên tục, đếm ngược Boss tuần và nhắc nhở làm nhiệm vụ hằng ngày.',
          category: BountyCategory.APP,
          difficulty: 3,
          rewardCoins: 7,
          rewardXp: 180,
          durationMinutes: 180,
          clientName: 'Chloe Bennett',
          clientRole: 'Product Manager Mobile',
          clientCompany: 'Vortex Mobile',
          clientAvatarUrl:
            'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
          clientNotes:
            'Widget cần nhẹ, hỗ trợ cả 3 kích thước Small, Medium, Large và đồng bộ dữ liệu nhanh qua Deep-link.',
          deliverableType: 'URL',
          tasks: [
            {
              id: 1,
              text: 'Khởi tạo widget extension cho iOS và Android',
              done: false,
            },
            {
              id: 2,
              text: 'Render streak flame icon và thanh tiến độ',
              done: false,
            },
            {
              id: 3,
              text: 'Tích hợp deeplink chuyển thẳng vào /tower hoặc /boss',
              done: false,
            },
          ],
          skills: ['React Native', 'Expo', 'Mobile Widgets', 'TypeScript'],
        },
        {
          slug: 'particle-fx-reward-chest-open',
          title: 'Hiệu Ứng Particle Mở Rương Phần Thưởng Sinh Động',
          description:
            'Tạo hiệu ứng mở rương kho báu bắn pháo hoa, văng xu BCN Coin và ánh hào quang lấp lánh bằng Canvas-Confetti hoặc CSS GPU acceleration.',
          category: BountyCategory.WEB,
          difficulty: 2,
          rewardCoins: 5,
          rewardXp: 130,
          durationMinutes: 120,
          clientName: 'Daniel Kim',
          clientRole: 'Creative Developer',
          clientCompany: 'Spark Creative',
          clientAvatarUrl:
            'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
          clientNotes:
            'Rương mở ra phải đem lại cảm giác phần thưởng cực kỳ thỏa mãn (satisfying reward moment)!',
          deliverableType: 'URL',
          tasks: [
            {
              id: 1,
              text: 'Vẽ rương gỗ viền vàng với 2 trạng thái đóng / mở',
              done: false,
            },
            {
              id: 2,
              text: 'Hiệu ứng nổ hạt xu bay lên theo quỹ đạo parabol',
              done: false,
            },
            {
              id: 3,
              text: 'Số dư ví nhảy số từ từ tương ứng với số xu nhận được',
              done: false,
            },
          ],
          skills: [
            'CSS 3D',
            'Canvas Confetti',
            'React Springs',
            'Framer Motion',
          ],
        },
        {
          slug: 'ai-prompt-eval-mentor-bot',
          title: 'Tối Ưu System Prompt & Evaluation Cho Bot Mentor AI',
          description:
            'Thiết kế bộ system prompt có cấu trúc và khung benchmark kiểm thử độ chính xác giải thích bài tập quiz theo chuẩn Socratic method.',
          category: BountyCategory.AI,
          difficulty: 4,
          rewardCoins: 8,
          rewardXp: 200,
          durationMinutes: 180,
          clientName: 'Dr. Aris Thorne',
          clientRole: 'AI Research Lead',
          clientCompany: 'Cognitive Dynamics',
          clientAvatarUrl:
            'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
          clientNotes:
            'Bot cần hướng dẫn người học tự suy nghĩ thay vì đưa ngay đáp án đúng. Cần bộ test dataset 30 câu hỏi thực tế.',
          deliverableType: 'URL',
          tasks: [
            {
              id: 1,
              text: 'Xây dựng Prompt Template chuẩn Chain-of-Thought',
              done: false,
            },
            {
              id: 2,
              text: 'Bộ test benchmark kiểm thử 30 bài quiz',
              done: false,
            },
            {
              id: 3,
              text: 'Đánh giá độ ảo giác (hallucination rate) < 2%',
              done: false,
            },
          ],
          skills: ['Prompt Engineering', 'LangChain', 'Python', 'LLM Eval'],
        },
        {
          slug: 'realtime-boss-battle-admin-dashboard',
          title: 'Phát Triển Web Dashboard Realtime Cho Admin Săn Boss',
          description:
            'Xây dựng bảng điều khiển thời gian thực theo dõi số người chơi online, tổng sát thương gây ra theo phút và biểu đồ máu Boss giảm theo thời gian.',
          category: BountyCategory.WEB,
          difficulty: 3,
          rewardCoins: 6,
          rewardXp: 160,
          durationMinutes: 150,
          clientName: 'Minh Tran',
          clientRole: 'Engineering Manager',
          clientCompany: 'BCN Global',
          clientAvatarUrl:
            'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150',
          clientNotes:
            'Dùng SSE hoặc WebSocket để cập nhật số liệu không cần reload trang. Giao diện sắc nét, tối ưu hiệu năng.',
          deliverableType: 'URL',
          tasks: [
            {
              id: 1,
              text: 'Kết nối SSE channel nhận stream sát thương',
              done: false,
            },
            {
              id: 2,
              text: 'Biểu đồ đường thời gian thực với Chart.js/Recharts',
              done: false,
            },
            {
              id: 3,
              text: 'Bộ lọc theo server và mốc sự kiện tuần',
              done: false,
            },
          ],
          skills: ['React', 'SSE', 'Recharts', 'TailwindCSS'],
        },
        {
          slug: 'smart-push-notification-engine',
          title: 'Hệ Thống Push Notification Thông Minh Giờ Vàng Boss',
          description:
            'Thiết kế cơ chế nhắc lịch săn boss tuần và duy trì chuỗi Streak không spam, cá nhân hóa theo khung giờ hoạt động quen thuộc của học viên.',
          category: BountyCategory.APP,
          difficulty: 4,
          rewardCoins: 7,
          rewardXp: 190,
          durationMinutes: 200,
          clientName: 'Sarah Jenkins',
          clientRole: 'Mobile Architect',
          clientCompany: 'AppVibe Global',
          clientAvatarUrl:
            'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
          clientNotes:
            'Tỷ lệ click mở app mục tiêu > 15%. Hỗ trợ badge count chính xác trên icon ứng dụng.',
          deliverableType: 'URL',
          tasks: [
            {
              id: 1,
              text: 'Tích hợp Firebase Cloud Messaging (FCM) & APNs',
              done: false,
            },
            {
              id: 2,
              text: 'Thuật toán xác định golden hour của từng user',
              done: false,
            },
            {
              id: 3,
              text: 'Xử lý deep link dẫn trực tiếp vào phòng Boss',
              done: false,
            },
          ],
          skills: ['FCM', 'React Native', 'APNs', 'NodeJS'],
        },
        {
          slug: 'gamified-design-system-ui-kit',
          title: 'Design System UI Kit 2.0 Cho Toàn Bộ Mini-Game BCN',
          description:
            'Hoàn thiện bộ UI Kit chuẩn Figma gồm HUD thanh kiếm, đồng hồ đếm ngược, rương phần thưởng, huy hiệu rank và nút bấm phong cách RPG.',
          category: BountyCategory.DESIGN,
          difficulty: 3,
          rewardCoins: 6,
          rewardXp: 140,
          durationMinutes: 120,
          clientName: 'Leo Nguyen',
          clientRole: 'Product Design Lead',
          clientCompany: 'Studio Horizon',
          clientAvatarUrl:
            'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150',
          clientNotes:
            'Design tokens đồng bộ 100% với file CSS tokens hiện hành. Giao diện phải nhất quán giữa cả Light và Dark Arena theme.',
          deliverableType: 'URL',
          tasks: [
            {
              id: 1,
              text: 'Bộ Component Button, Badges, Cards có Dark Theme',
              done: false,
            },
            {
              id: 2,
              text: 'Icon set vector cho các dạng nhiệm vụ',
              done: false,
            },
            {
              id: 3,
              text: 'Hướng dẫn sử dụng Token (Spacing, Typography, Shadow)',
              done: false,
            },
          ],
          skills: ['Figma', 'Design Tokens', 'Design Systems', 'Dark Mode'],
        },
      ];

      for (const b of initialBounties) {
        const existing = await this.prisma.bounty.findUnique({
          where: { slug: b.slug },
        });

        if (!existing) {
          await this.prisma.bounty.create({
            data: {
              slug: b.slug,
              title: b.title,
              description: b.description,
              category: b.category,
              difficulty: b.difficulty,
              rewardCoins: b.rewardCoins,
              rewardXp: b.rewardXp,
              durationMinutes: b.durationMinutes,
              clientName: b.clientName,
              clientRole: b.clientRole,
              clientCompany: b.clientCompany,
              clientAvatarUrl: b.clientAvatarUrl,
              clientNotes: b.clientNotes,
              deliverableType: b.deliverableType,
              tasks: b.tasks,
              skills: b.skills,
              status: BountyStatus.OPEN,
            },
          });
        }
      }

      // Seed sample submissions if none exist
      const existingSubmissions = await this.prisma.bountyAssignment.count();
      if (existingSubmissions === 0) {
        const bounties = await this.prisma.bounty.findMany({ take: 4 });
        if (bounties.length >= 4) {
          const now = Date.now();
          // 1. SUBMITTED assignment for review queue
          await this.prisma.bountyAssignment.create({
            data: {
              userId: 'learner-sample-1',
              bountyId: bounties[0].id,
              status: BountyAssignmentStatus.SUBMITTED,
              acceptedAt: new Date(now - 7200_000),
              expiresAt: new Date(now + 3600_000),
              submittedAt: new Date(now - 1800_000),
              projectUrl: 'https://github.com/bcn-learner/dark-mode-tower',
              submissionNotes:
                'Đã hoàn thành toggle dark theme Neon RPG và tích hợp âm thanh Web Audio API.',
            },
          });

          // 2. SUBMITTED assignment for review queue
          await this.prisma.bountyAssignment.create({
            data: {
              userId: 'learner-sample-2',
              bountyId: bounties[1].id,
              status: BountyAssignmentStatus.SUBMITTED,
              acceptedAt: new Date(now - 14400_000),
              expiresAt: new Date(now + 7200_000),
              submittedAt: new Date(now - 3600_000),
              projectUrl: 'https://figma.com/file/sample-bcn-profile-card',
              submissionNotes:
                'Bản thiết kế Figma thẻ bài Thợ Săn BCN đầy đủ Auto-layout.',
            },
          });

          // 3. APPROVED assignment for history verification
          await this.prisma.bountyAssignment.create({
            data: {
              userId: 'learner-sample-3',
              bountyId: bounties[2].id,
              status: BountyAssignmentStatus.APPROVED,
              acceptedAt: new Date(now - 86400_000),
              expiresAt: new Date(now - 43200_000),
              submittedAt: new Date(now - 50000_000),
              reviewedAt: new Date(now - 45000_000),
              reviewedBy: 'mentor-admin',
              projectUrl: 'https://github.com/bcn-learner/particle-fx-chest',
              submissionNotes:
                'Đã tạo hiệu ứng Canvas pháo hoa và âm thanh xu.',
              reviewFeedback:
                'Hiệu ứng mở rương rất mượt mà và đã mắt! Đạt chuẩn nghiệm thu xuất sắc.',
            },
          });

          // 4. EXPIRED assignment for history verification
          await this.prisma.bountyAssignment.create({
            data: {
              userId: 'learner-sample-4',
              bountyId: bounties[3].id,
              status: BountyAssignmentStatus.EXPIRED,
              acceptedAt: new Date(now - 172800_000),
              expiresAt: new Date(now - 86400_000),
            },
          });
        }
      }

      this.logger.log(
        `[BountyService] Successfully verified/seeded rich bounties and sample submissions.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[BountyService] Could not seed initial bounties: ${msg}`,
      );
    }
  }

  private async notify(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    dedupKey: string,
  ) {
    try {
      const rows = await this.prisma.notification.createManyAndReturn({
        data: [{ userId, type, title, message, dedupKey }],
        skipDuplicates: true,
      });
      if (this.notificationService) {
        await this.notificationService.publishCreated(rows);
      }
    } catch (error) {
      this.logger.warn(
        `Bounty notification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async notifyMany(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    dedupPrefix: string,
  ) {
    if (!userIds.length) return;
    try {
      const data = userIds.map((userId) => ({
        userId,
        type,
        title,
        message,
        dedupKey: `${dedupPrefix}:${userId}`,
      }));
      const rows = await this.prisma.notification.createManyAndReturn({
        data,
        skipDuplicates: true,
      });
      if (this.notificationService) {
        await this.notificationService.publishCreated(rows);
      }
    } catch (error) {
      this.logger.warn(
        `Bounty notifyMany failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
