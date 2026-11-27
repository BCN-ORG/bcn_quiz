import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CoinRewardSource,
  CoinTransaction,
  CoinTransactionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { CoinApiClient, getCoinProviderMode } from './coin-api.client';
import {
  CoinConfigService,
  UpdateCoinSystemConfigInput,
} from './coin-config.service';
import { CoinTrackingService } from './coin-tracking.service';
import {
  CoinExportQueryDto,
  CoinTransactionQueryDto,
  UserRewardsQueryDto,
} from './dto/coin-admin.dto';

export interface CoinOverviewResult {
  totalCoinsDistributed: number;
  totalTransactions: number;
  uniqueRecipients: number;
  statusBreakdown: Record<
    CoinTransactionStatus,
    { count: number; totalCoins: number }
  >;
  sourceBreakdown: Record<
    CoinRewardSource,
    { count: number; totalCoins: number }
  >;
  recentTransactions: CoinTransaction[];
}

@Injectable()
export class CoinAdminService {
  private readonly logger = new Logger(CoinAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly profilesService: ProfilesService,
    private readonly coinTrackingService: CoinTrackingService,
    private readonly coinApiClient: CoinApiClient,
    private readonly coinConfigService: CoinConfigService,
  ) {}

  /**
   * High-level KPI overview of coin distribution.
   */
  async getOverview(): Promise<CoinOverviewResult> {
    const [
      totalDistributedAgg,
      totalCount,
      statusAgg,
      sourceAgg,
      recentList,
      uniqueUserRows,
    ] = await Promise.all([
      this.prisma.coinTransaction.aggregate({
        where: { status: CoinTransactionStatus.SUCCESS },
        _sum: { amount: true },
      }),
      this.prisma.coinTransaction.count(),
      this.prisma.coinTransaction.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.coinTransaction.groupBy({
        by: ['source'],
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.coinTransaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.coinTransaction.findMany({
        where: { status: CoinTransactionStatus.SUCCESS },
        distinct: ['userId'],
        select: { userId: true },
      }),
    ]);

    const statusBreakdown: Record<
      CoinTransactionStatus,
      { count: number; totalCoins: number }
    > = {
      [CoinTransactionStatus.SUCCESS]: { count: 0, totalCoins: 0 },
      [CoinTransactionStatus.PENDING]: { count: 0, totalCoins: 0 },
      [CoinTransactionStatus.FAILED]: { count: 0, totalCoins: 0 },
      [CoinTransactionStatus.UNKNOWN]: { count: 0, totalCoins: 0 },
    };

    for (const item of statusAgg) {
      statusBreakdown[item.status] = {
        count: item._count.id,
        totalCoins: item._sum.amount ?? 0,
      };
    }

    const sourceBreakdown: Record<
      CoinRewardSource,
      { count: number; totalCoins: number }
    > = {
      [CoinRewardSource.TOWER]: { count: 0, totalCoins: 0 },
      [CoinRewardSource.BOSS]: { count: 0, totalCoins: 0 },
      [CoinRewardSource.BOUNTY]: { count: 0, totalCoins: 0 },
      [CoinRewardSource.LEADERBOARD]: { count: 0, totalCoins: 0 },
      [CoinRewardSource.DAILY_QUEST]: { count: 0, totalCoins: 0 },
      [CoinRewardSource.WEEKLY_QUEST]: { count: 0, totalCoins: 0 },
      [CoinRewardSource.MYSTERY_CHEST_REFUND]: { count: 0, totalCoins: 0 },
      [CoinRewardSource.SEASON_PASS]: { count: 0, totalCoins: 0 },
      [CoinRewardSource.PVP_MATCH]: { count: 0, totalCoins: 0 },
      [CoinRewardSource.GUILD_BOSS]: { count: 0, totalCoins: 0 },
      [CoinRewardSource.LEVEL_UP]: { count: 0, totalCoins: 0 },
      [CoinRewardSource.OTHER]: { count: 0, totalCoins: 0 },
    };

    for (const item of sourceAgg) {
      sourceBreakdown[item.source] = {
        count: item._count.id,
        totalCoins: item._sum.amount ?? 0,
      };
    }

    // Enrich recent transactions with profile username if missing
    const enrichedRecent =
      await this.enrichTransactionsWithProfiles(recentList);

    return {
      totalCoinsDistributed: totalDistributedAgg._sum.amount ?? 0,
      totalTransactions: totalCount,
      uniqueRecipients: uniqueUserRows.length,
      statusBreakdown,
      sourceBreakdown,
      recentTransactions: enrichedRecent,
    };
  }

  async getBotWalletStatus() {
    const config = await this.coinConfigService.getConfig();
    const providerMode = getCoinProviderMode();
    const poolInsufficientCount = await this.prisma.coinTransaction.count({
      where: {
        providerMode,
        status: CoinTransactionStatus.FAILED,
        errorCode: 'REWARD_POOL_INSUFFICIENT',
      },
    });

    if (providerMode !== 'live') {
      return {
        providerMode,
        botDiscordId: null,
        balance: null,
        alertLevel: poolInsufficientCount > 0 ? 'CRITICAL' : 'MOCK',
        poolInsufficientCount,
        warningThreshold: config.botWarningThreshold,
        criticalThreshold: config.botCriticalThreshold,
        message: 'Hệ thống đang chạy ở chế độ mock.',
      };
    }

    const alertLevel: 'OK' | 'CRITICAL' =
      poolInsufficientCount > 0 ? 'CRITICAL' : 'OK';
    const message =
      poolInsufficientCount > 0
        ? `Có ${poolInsufficientCount} giao dịch thất bại do ví bot thiếu Coin (REWARD_POOL_INSUFFICIENT). Vui lòng nạp ví bot qua Payroll API rồi bấm đối soát.`
        : 'Hệ thống trả thưởng Coin (LIVE) hoạt động bình thường.';

    return {
      providerMode,
      botDiscordId: null,
      balance: null,
      alertLevel,
      poolInsufficientCount,
      warningThreshold: config.botWarningThreshold,
      criticalThreshold: config.botCriticalThreshold,
      message,
    };
  }

  async getConfig() {
    return {
      providerMode: getCoinProviderMode(),
      ...(await this.coinConfigService.getConfig()),
    };
  }

  async updateConfig(input: UpdateCoinSystemConfigInput, adminUserId: string) {
    const updated = await this.coinConfigService.updateConfig(
      input,
      adminUserId,
    );
    return {
      providerMode: getCoinProviderMode(),
      ...updated,
    };
  }

  /**
   * Paginated search & filter for coin transactions.
   */
  async getTransactions(query: CoinTransactionQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CoinTransactionWhereInput = {};

    if (query.userId?.trim()) {
      where.userId = query.userId.trim();
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.source) {
      where.source = query.source;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        // Set to end of the given day if time is omitted
        const end = new Date(query.endDate);
        if (query.endDate.length <= 10) {
          end.setHours(23, 59, 59, 999);
        }
        where.createdAt.lte = end;
      }
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { userId: { contains: term, mode: 'insensitive' } },
        { username: { contains: term, mode: 'insensitive' } },
        { idempotencyKey: { contains: term, mode: 'insensitive' } },
        { externalTxId: { contains: term, mode: 'insensitive' } },
        { referenceId: { contains: term, mode: 'insensitive' } },
        { reason: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.coinTransaction.count({ where }),
      this.prisma.coinTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const enrichedItems = await this.enrichTransactionsWithProfiles(items);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: enrichedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Detailed view of a single coin transaction including audit & reconciliation history.
   */
  async getTransactionById(id: string) {
    const tx = await this.prisma.coinTransaction.findUnique({
      where: { id },
    });

    if (!tx) {
      throw new NotFoundException(
        `Giao dịch Coin với ID "${id}" không tồn tại.`,
      );
    }

    const [enriched] = await this.enrichTransactionsWithProfiles([tx]);
    return enriched;
  }

  /**
   * Manual trigger to reconcile an unknown or pending transaction.
   */
  async reconcileTransaction(id: string, triggeredBy = 'ADMIN_MANUAL') {
    return this.coinTrackingService.reconcileTransaction(id, triggeredBy);
  }

  /**
   * View reward history and stats for a specific user.
   */
  async getUserRewardHistory(userId: string, query?: UserRewardsQueryDto) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 50));
    const skip = (page - 1) * limit;

    const [total, transactions, profileMap] = await Promise.all([
      this.prisma.coinTransaction.count({ where: { userId } }),
      this.prisma.coinTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.profilesService.resolveUsers([userId]).catch(() => new Map()),
    ]);

    const profile = profileMap.get(userId);

    const [successAgg, pendingAgg, sourceAgg] = await Promise.all([
      this.prisma.coinTransaction.aggregate({
        where: { userId, status: CoinTransactionStatus.SUCCESS },
        _sum: { amount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: {
          userId,
          status: {
            in: [CoinTransactionStatus.PENDING, CoinTransactionStatus.UNKNOWN],
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.coinTransaction.groupBy({
        by: ['source'],
        where: { userId, status: CoinTransactionStatus.SUCCESS },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    const sourceBreakdown: Record<
      string,
      { count: number; totalCoins: number }
    > = {};
    for (const item of sourceAgg) {
      sourceBreakdown[item.source] = {
        count: item._count.id,
        totalCoins: item._sum.amount ?? 0,
      };
    }

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      userId,
      username:
        profile?.fullName ||
        profile?.email ||
        transactions[0]?.username ||
        null,
      avatarUrl: profile?.avatarUrl ?? null,
      totalCoinsEarned: successAgg._sum.amount ?? 0,
      pendingCoins: pendingAgg._sum.amount ?? 0,
      totalTransactions: total,
      sourceBreakdown,
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Exports filtered transactions as a UTF-8 CSV with BOM.
   */
  async exportTransactionsCsv(query: CoinExportQueryDto): Promise<{
    buffer: Buffer;
    filename: string;
  }> {
    const where: Prisma.CoinTransactionWhereInput = {};

    if (query.userId?.trim()) {
      where.userId = query.userId.trim();
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.source) {
      where.source = query.source;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        if (query.endDate.length <= 10) {
          end.setHours(23, 59, 59, 999);
        }
        where.createdAt.lte = end;
      }
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { userId: { contains: term, mode: 'insensitive' } },
        { username: { contains: term, mode: 'insensitive' } },
        { idempotencyKey: { contains: term, mode: 'insensitive' } },
        { externalTxId: { contains: term, mode: 'insensitive' } },
        { referenceId: { contains: term, mode: 'insensitive' } },
        { reason: { contains: term, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.coinTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const enriched = await this.enrichTransactionsWithProfiles(items);

    const headers = [
      'ID',
      'User ID',
      'Username',
      'Source',
      'Amount',
      'Status',
      'Reason',
      'Reference ID',
      'Season ID',
      'External TX ID',
      'Idempotency Key',
      'Created At',
      'Processed At',
      'Error Message',
    ];

    const escapeCsv = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '';
      const str = typeof val === 'string' ? val : String(val);
      if (
        str.includes(',') ||
        str.includes('"') ||
        str.includes('\n') ||
        str.includes('\r')
      ) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = enriched.map((tx) => [
      escapeCsv(tx.id),
      escapeCsv(tx.userId),
      escapeCsv(tx.username || ''),
      escapeCsv(tx.source),
      escapeCsv(tx.amount),
      escapeCsv(tx.status),
      escapeCsv(tx.reason || ''),
      escapeCsv(tx.referenceId || ''),
      escapeCsv(tx.seasonId || ''),
      escapeCsv(tx.externalTxId || ''),
      escapeCsv(tx.idempotencyKey),
      escapeCsv(tx.createdAt ? tx.createdAt.toISOString() : ''),
      escapeCsv(tx.processedAt ? tx.processedAt.toISOString() : ''),
      escapeCsv(tx.errorMessage || ''),
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `coin-transactions-${dateStr}.csv`;

    return {
      buffer: Buffer.from(csvContent, 'utf-8'),
      filename,
    };
  }

  /**
   * Helper to batch-resolve usernames from ProfilesService for transactions where username is empty.
   */
  private async enrichTransactionsWithProfiles(
    transactions: CoinTransaction[],
  ): Promise<CoinTransaction[]> {
    if (!transactions.length) return [];

    const userIdsToFetch = Array.from(
      new Set(
        transactions
          .filter((t) => !t.username)
          .map((t) => t.userId)
          .filter(Boolean),
      ),
    );

    if (!userIdsToFetch.length) return transactions;

    try {
      // ProfilesService batch resolution is capped at 100 per call
      const chunks: string[][] = [];
      for (let i = 0; i < userIdsToFetch.length; i += 100) {
        chunks.push(userIdsToFetch.slice(i, i + 100));
      }

      const profileMap = new Map<string, string>();
      for (const chunk of chunks) {
        const resolved = await this.profilesService.resolveUsers(chunk);
        for (const [id, summary] of resolved.entries()) {
          profileMap.set(id, summary.fullName || summary.email);
        }
      }

      return transactions.map((t) => {
        if (!t.username && profileMap.has(t.userId)) {
          return {
            ...t,
            username: profileMap.get(t.userId) || null,
          };
        }
        return t;
      });
    } catch (err: unknown) {
      this.logger.debug(
        `[CoinAdminService] Profiles resolution skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return transactions;
    }
  }
}
