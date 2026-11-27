import { PvpMatchStatus } from '@prisma/client';
import { PvpService } from './pvp.service';

describe('PvpService', () => {
  it('creates a waiting match and starts it when player2 joins by code', async () => {
    const prisma = {
      topic: { findFirst: jest.fn().mockResolvedValue({ id: 't1' }) },
      quiz: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]),
      },
      pvpMatch: {
        create: jest.fn().mockResolvedValue({
          id: 'm1',
          inviteCode: 'ABC123',
          status: PvpMatchStatus.WAITING,
          player1Id: 'u1',
          player2Id: null,
          questionIds: ['q1', 'q2', 'q3'],
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'm1',
          inviteCode: 'ABC123',
          status: PvpMatchStatus.WAITING,
          player1Id: 'u1',
          player2Id: null,
          questionIds: ['q1', 'q2', 'q3'],
        }),
        update: jest.fn().mockResolvedValue({
          id: 'm1',
          inviteCode: 'ABC123',
          status: PvpMatchStatus.IN_PROGRESS,
          player1Id: 'u1',
          player2Id: 'u2',
          startedAt: new Date(),
        }),
      },
    };
    const xp = { award: jest.fn() };
    const svc = new PvpService(prisma as never, xp as never);

    const created = await svc.createMatch('u1');
    expect(created.status).toBe(PvpMatchStatus.WAITING);

    const joined = await svc.joinByCode('u2', 'abc123');
    expect(joined.status).toBe(PvpMatchStatus.IN_PROGRESS);
    expect(joined.player2Id).toBe('u2');
  });

  it('settles a match at most once when concurrent final answers race (updateMany count === 0)', async () => {
    const prisma = {
      pvpMatch: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'm1',
          status: PvpMatchStatus.IN_PROGRESS,
          player1Id: 'u1',
          player2Id: 'u2',
          questionIds: ['q1'],
          answers: [],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      quiz: {
        findUnique: jest.fn().mockResolvedValue({ answer: 'A' }),
      },
      pvpMatchAnswer: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([
          { userId: 'u1', points: 120 },
          { userId: 'u2', points: 100 },
        ]),
      },
      pvpUserRating: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const xp = { award: jest.fn() };
    const svc = new PvpService(prisma as never, xp as never);

    const res = await svc.submitAnswer('m1', 'u1', {
      questionIndex: 0,
      selectedAnswer: 'A',
      responseMs: 2000,
    });
    expect(res.matchCompleted).toBe(true);
    expect(prisma.pvpUserRating.upsert).not.toHaveBeenCalled();
    expect(xp.award).not.toHaveBeenCalled();
  });
});
