import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CoinRewardSource, PvpMatchStatus, XpSourceType } from '@prisma/client';
import { EventEmitter } from 'events';
import {
  Observable,
  defer,
  from,
  fromEvent,
  map,
  merge,
  of,
  switchMap,
} from 'rxjs';
import { getCoinProviderMode } from '../coin/coin-api.client';
import { CoinTrackingService } from '../coin/coin-tracking.service';
import { LiveCoinRewardAdapter } from '../coin/live-coin-reward.adapter';
import { DiscordWebhookService } from '../discord-webhook/discord-webhook.service';
import { businessDate } from '../leaderboard/leaderboard-rules';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { MockCoinWalletService } from '../wallet/mock-coin-wallet.service';
import { XpService } from '../xp/xp.service';

const PVP_QUESTIONS_PER_MATCH = 5;
const PVP_DAILY_COIN_MATCH_CAP = 5;
const PVP_WIN_COINS = 10;
const PVP_WIN_XP = 30;
const PVP_LOSS_XP = 10;

@Injectable()
export class PvpService {
  private readonly emitter = new EventEmitter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
    @Optional() private readonly profilesService?: ProfilesService,
    @Optional() private readonly mockWalletService?: MockCoinWalletService,
    @Optional() private readonly coinTrackingService?: CoinTrackingService,
    @Optional() private readonly liveRewardAdapter?: LiveCoinRewardAdapter,
    @Optional() private readonly discordWebhook?: DiscordWebhookService,
  ) {
    this.emitter.setMaxListeners(200);
  }

  private emitMatch(matchId: string, event: Record<string, unknown>) {
    this.emitter.emit(`match:${matchId}`, event);
  }

  async assertParticipant(matchId: string, userId: string): Promise<void> {
    const match = await this.prisma.pvpMatch.findUnique({
      where: { id: matchId },
      select: { player1Id: true, player2Id: true },
    });
    if (!match) throw new NotFoundException('Không tìm thấy trận đấu.');
    if (match.player1Id !== userId && match.player2Id !== userId) {
      throw new BadRequestException('Bạn không thuộc trận đấu này.');
    }
  }

  streamMatch(
    matchId: string,
    userId: string,
  ): Observable<{ data: Record<string, unknown> }> {
    return defer(() => from(this.assertParticipant(matchId, userId))).pipe(
      switchMap(() =>
        merge(
          of({ data: { type: 'CONNECTED', matchId } }),
          fromEvent(this.emitter, `match:${matchId}`).pipe(
            map((payload) => ({ data: payload as Record<string, unknown> })),
          ),
        ),
      ),
    );
  }

  async getMyRating(userId: string) {
    const rating = await this.prisma.pvpUserRating.findUnique({
      where: { userId },
    });
    return (
      rating ?? {
        userId,
        elo: 1000,
        wins: 0,
        losses: 0,
        draws: 0,
        winStreak: 0,
        bestWinStreak: 0,
      }
    );
  }

  async getLeaderboard() {
    const rows = await this.prisma.pvpUserRating.findMany({
      orderBy: [{ elo: 'desc' }, { wins: 'desc' }],
      take: 20,
    });
    const ids = rows.map((r) => r.userId);
    const profiles =
      this.profilesService && ids.length > 0
        ? await this.profilesService.resolveUsers(ids).catch(() => new Map())
        : new Map();
    return rows.map((r, idx) => {
      const p = profiles.get(r.userId);
      return {
        rank: idx + 1,
        userId: r.userId,
        fullName: p?.fullName ?? null,
        avatarUrl: p?.avatarUrl ?? null,
        elo: r.elo,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        winStreak: r.winStreak,
      };
    });
  }

  async createMatch(userId: string, topicId?: string) {
    let resolvedTopicId = topicId?.trim();
    if (!resolvedTopicId) {
      const firstTopic = await this.prisma.topic.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!firstTopic) {
        throw new BadRequestException('Chưa có chủ đề nào để tạo trận PvP.');
      }
      resolvedTopicId = firstTopic.id;
    }

    const quizzes = await this.prisma.quiz.findMany({
      where: { topicId: resolvedTopicId },
      select: { id: true },
      take: 30,
    });
    if (quizzes.length === 0) {
      throw new BadRequestException('Chủ đề này chưa có câu hỏi để đấu PvP.');
    }

    const shuffled = [...quizzes]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(PVP_QUESTIONS_PER_MATCH, quizzes.length))
      .map((q) => q.id);

    const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

    const match = await this.prisma.pvpMatch.create({
      data: {
        topicId: resolvedTopicId,
        inviteCode,
        status: PvpMatchStatus.WAITING,
        player1Id: userId,
        questionIds: shuffled,
      },
    });

    return match;
  }

  async joinByCode(userId: string, inviteCode: string) {
    const code = inviteCode?.trim().toUpperCase();
    const match = await this.prisma.pvpMatch.findUnique({
      where: { inviteCode: code },
    });
    if (!match) {
      throw new NotFoundException('Không tìm thấy phòng PvP với mã này.');
    }
    if (match.player1Id === userId) {
      return match;
    }
    if (match.status !== PvpMatchStatus.WAITING || match.player2Id) {
      throw new BadRequestException(
        'Phòng PvP này đã đủ người hoặc đã kết thúc.',
      );
    }

    const updated = await this.prisma.pvpMatch.update({
      where: { id: match.id },
      data: {
        player2Id: userId,
        status: PvpMatchStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });

    this.emitMatch(updated.id, {
      type: 'MATCH_START',
      matchId: updated.id,
      player1Id: updated.player1Id,
      player2Id: updated.player2Id,
      startedAt: updated.startedAt?.toISOString(),
    });

    return updated;
  }

  async getMatchDetail(matchId: string, userId: string) {
    const match = await this.prisma.pvpMatch.findUnique({
      where: { id: matchId },
      include: { answers: true },
    });
    if (!match) throw new NotFoundException('Không tìm thấy trận đấu.');
    if (match.player1Id !== userId && match.player2Id !== userId) {
      throw new BadRequestException('Bạn không thuộc trận đấu này.');
    }

    const [quizzes, profiles] = await Promise.all([
      this.prisma.quiz.findMany({
        where: { id: { in: match.questionIds } },
        include: { options: { orderBy: { id: 'asc' } } },
      }),
      this.profilesService
        ? this.profilesService
            .resolveUsers(
              [match.player1Id, match.player2Id].filter((id): id is string =>
                Boolean(id),
              ),
            )
            .catch(() => new Map())
        : Promise.resolve(new Map()),
    ]);

    const quizMap = new Map(quizzes.map((q) => [q.id, q]));
    const orderedQuestions = match.questionIds
      .map((id, idx) => {
        const q = quizMap.get(id);
        if (!q) return null;
        return {
          index: idx,
          quizId: q.id,
          question: q.question,
          options: q.options.map((o) => ({
            id: o.id,
            label: o.label,
            text: o.content,
          })),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const p1 = profiles.get(match.player1Id);
    const p2 = match.player2Id ? profiles.get(match.player2Id) : null;

    return {
      id: match.id,
      inviteCode: match.inviteCode,
      status: match.status,
      player1: {
        userId: match.player1Id,
        fullName: p1?.fullName ?? 'Người chơi 1',
        avatarUrl: p1?.avatarUrl ?? null,
        score: match.player1Score,
        answeredCount: match.answers.filter((a) => a.userId === match.player1Id)
          .length,
      },
      player2: match.player2Id
        ? {
            userId: match.player2Id,
            fullName: p2?.fullName ?? 'Người chơi 2',
            avatarUrl: p2?.avatarUrl ?? null,
            score: match.player2Score,
            answeredCount: match.answers.filter(
              (a) => a.userId === match.player2Id,
            ).length,
          }
        : null,
      winnerId: match.winnerId,
      myAnswers: match.answers
        .filter((a) => a.userId === userId)
        .map((a) => ({
          questionIndex: a.questionIndex,
          selectedAnswer: a.selectedAnswer,
          isCorrect: a.isCorrect,
          points: a.points,
        })),
      questions: orderedQuestions,
    };
  }

  async submitAnswer(
    matchId: string,
    userId: string,
    payload: {
      questionIndex: number;
      selectedAnswer: string;
      responseMs?: number;
    },
  ) {
    const match = await this.prisma.pvpMatch.findUnique({
      where: { id: matchId },
      include: { answers: true },
    });
    if (!match) throw new NotFoundException('Không tìm thấy trận đấu.');
    if (match.status !== PvpMatchStatus.IN_PROGRESS) {
      throw new BadRequestException('Trận đấu chưa bắt đầu hoặc đã kết thúc.');
    }
    if (match.player1Id !== userId && match.player2Id !== userId) {
      throw new BadRequestException('Bạn không thuộc trận đấu này.');
    }

    const qId = match.questionIds[payload?.questionIndex];
    if (!qId) throw new BadRequestException('Câu hỏi không hợp lệ.');
    if (
      typeof payload?.selectedAnswer !== 'string' ||
      !payload.selectedAnswer.trim()
    ) {
      throw new BadRequestException('Vui lòng chọn một đáp án hợp lệ.');
    }

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: qId },
      select: { answer: true },
    });
    if (!quiz) throw new NotFoundException('Không tìm thấy câu hỏi.');

    const isCorrect =
      payload.selectedAnswer.trim().toLowerCase() ===
      quiz.answer.trim().toLowerCase();
    const safeMs = Math.max(
      0,
      Math.min(60_000, Number(payload.responseMs) || 5000),
    );
    const speedBonus = isCorrect
      ? Math.max(0, Math.round((15_000 - safeMs) / 300))
      : 0;
    const points = isCorrect ? 100 + speedBonus : 0;

    await this.prisma.pvpMatchAnswer.upsert({
      where: {
        matchId_userId_questionIndex: {
          matchId,
          userId,
          questionIndex: payload.questionIndex,
        },
      },
      update: {},
      create: {
        matchId,
        userId,
        questionIndex: payload.questionIndex,
        selectedAnswer: payload.selectedAnswer,
        isCorrect,
        responseMs: safeMs,
        points,
      },
    });

    const allAnswers = await this.prisma.pvpMatchAnswer.findMany({
      where: { matchId },
    });
    const p1Answers = allAnswers.filter((a) => a.userId === match.player1Id);
    const p2Answers = allAnswers.filter((a) => a.userId === match.player2Id);
    const p1Score = p1Answers.reduce((s, a) => s + a.points, 0);
    const p2Score = p2Answers.reduce((s, a) => s + a.points, 0);

    const totalQ = match.questionIds.length;
    const bothFinished =
      p1Answers.length >= totalQ && p2Answers.length >= totalQ;

    let winnerId: string | null = null;
    if (bothFinished) {
      if (p1Score > p2Score) winnerId = match.player1Id;
      else if (p2Score > p1Score) winnerId = match.player2Id;
    }

    let settledNow = false;
    if (bothFinished) {
      const transition = await this.prisma.pvpMatch.updateMany({
        where: { id: matchId, status: PvpMatchStatus.IN_PROGRESS },
        data: {
          player1Score: p1Score,
          player2Score: p2Score,
          status: PvpMatchStatus.COMPLETED,
          winnerId,
          endedAt: new Date(),
        },
      });
      settledNow = transition.count === 1;
    } else {
      await this.prisma.pvpMatch.updateMany({
        where: { id: matchId, status: PvpMatchStatus.IN_PROGRESS },
        data: {
          player1Score: p1Score,
          player2Score: p2Score,
        },
      });
    }

    if (!bothFinished || settledNow) {
      this.emitMatch(matchId, {
        type: bothFinished ? 'MATCH_END' : 'OPPONENT_PROGRESS',
        matchId,
        player1Score: p1Score,
        player2Score: p2Score,
        p1Answered: p1Answers.length,
        p2Answered: p2Answers.length,
        winnerId,
      });
    }

    if (settledNow && match.player2Id) {
      await this.settleMatch(
        matchId,
        match.player1Id,
        match.player2Id,
        winnerId,
      );
    }

    return {
      isCorrect,
      points,
      correctAnswer: quiz.answer,
      matchCompleted: bothFinished,
      winnerId,
      player1Score: p1Score,
      player2Score: p2Score,
    };
  }

  private async settleMatch(
    matchId: string,
    p1Id: string,
    p2Id: string,
    winnerId: string | null,
  ) {
    const updateOne = async (uid: string, outcome: 'WIN' | 'LOSS' | 'DRAW') => {
      const cur = await this.getMyRating(uid);
      const eloDelta = outcome === 'WIN' ? 20 : outcome === 'LOSS' ? -15 : 0;
      const nextStreak = outcome === 'WIN' ? cur.winStreak + 1 : 0;
      const nextBest = Math.max(cur.bestWinStreak, nextStreak);
      await this.prisma.pvpUserRating.upsert({
        where: { userId: uid },
        update: {
          elo: Math.max(100, cur.elo + eloDelta),
          wins: outcome === 'WIN' ? { increment: 1 } : undefined,
          losses: outcome === 'LOSS' ? { increment: 1 } : undefined,
          draws: outcome === 'DRAW' ? { increment: 1 } : undefined,
          winStreak: nextStreak,
          bestWinStreak: nextBest,
        },
        create: {
          userId: uid,
          elo: Math.max(100, 1000 + eloDelta),
          wins: outcome === 'WIN' ? 1 : 0,
          losses: outcome === 'LOSS' ? 1 : 0,
          draws: outcome === 'DRAW' ? 1 : 0,
          winStreak: nextStreak,
          bestWinStreak: nextBest,
        },
      });

      await this.xpService.award(
        uid,
        XpSourceType.PVP_MATCH,
        `pvp:${matchId}:${uid}`,
        outcome === 'WIN' ? PVP_WIN_XP : PVP_LOSS_XP,
      );

      if (outcome === 'WIN') {
        await this.awardWinCoinsIfUnderDailyCap(uid, matchId);
        if (nextStreak === 5) {
          void this.discordWebhook?.sendAnnouncement({
            title: '🔥 Chuỗi thắng 5 trận PvP 1v1 liên tiếp!',
            description: `Chiến binh \`${uid}\` vừa đạt chuỗi 5 trận thắng liên tiếp trên Đấu trường PvP BCN Arena!`,
            color: 0xf97316,
          });
        }
      }
    };

    await Promise.all([
      updateOne(
        p1Id,
        winnerId === null ? 'DRAW' : winnerId === p1Id ? 'WIN' : 'LOSS',
      ),
      updateOne(
        p2Id,
        winnerId === null ? 'DRAW' : winnerId === p2Id ? 'WIN' : 'LOSS',
      ),
    ]);
  }

  private async awardWinCoinsIfUnderDailyCap(userId: string, matchId: string) {
    const day = businessDate(new Date());
    const dayStart = new Date(`${day}T00:00:00.000+07:00`);
    const todayWins = await this.prisma.pvpMatch
      .count({
        where: {
          winnerId: userId,
          status: PvpMatchStatus.COMPLETED,
          endedAt: { gte: dayStart },
        },
      })
      .catch(() => 0);
    if (todayWins > PVP_DAILY_COIN_MATCH_CAP) return;

    const idempotencyKey = `pvp:win:${matchId}:${userId}`;
    const reason = `Thưởng thắng trận PvP 1v1 (${matchId.slice(-6)})`;
    if (getCoinProviderMode() === 'live') {
      if (!this.liveRewardAdapter || !this.coinTrackingService) return;
      const prep = await this.liveRewardAdapter.preparePayload({
        userId,
        amount: PVP_WIN_COINS,
        idempotencyKey,
        source: CoinRewardSource.PVP_MATCH,
        description: reason,
        metadata: { kind: 'PVP_MATCH', matchId },
      });
      if (!prep.ok || !prep.payload) return;
      const tracked = await this.coinTrackingService.recordPending({
        userId,
        amount: prep.payload.amount,
        source: CoinRewardSource.PVP_MATCH,
        reason,
        referenceId: matchId,
        idempotencyKey,
        requestPayload: prep.payload,
      });
      if (tracked.status === 'SUCCESS') return;
      const res = await this.liveRewardAdapter.dispatchPayload(prep.payload);
      if (res.status === 'SUCCESS') {
        await this.coinTrackingService.recordSuccess(
          idempotencyKey,
          res.externalTxId,
          res.responsePayload,
        );
      }
      return;
    }

    if (this.mockWalletService) {
      await this.mockWalletService.creditReward({
        userId,
        amount: PVP_WIN_COINS,
        idempotencyKey,
        source: 'PVP_MATCH',
        description: reason,
      });
    }
  }
}
