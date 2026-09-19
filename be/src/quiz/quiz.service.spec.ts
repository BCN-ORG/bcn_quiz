import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QuizService } from './quiz.service';

function quizPayload(index: number, topicId = 'topic-1') {
  return {
    quizCode: `q_${String(index + 1).padStart(3, '0')}`,
    question: `Question ${index + 1}`,
    answer: 'A',
    topicId,
    options: [
      { label: 'A', content: 'one', isCode: false },
      { label: 'B', content: 'two', isCode: false },
      { label: 'C', content: 'three', isCode: false },
      { label: 'D', content: 'four', isCode: false },
    ],
  };
}

describe('QuizService.createQuizzes', () => {
  const prisma = {
    topic: { findMany: jest.fn() },
    quiz: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      create: jest.fn(),
    },
    option: { createMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const minioService = {
    getMinIOConfig: jest.fn(() => ({ cloudName: 'demo' })),
    assertImageWithinMaxBytes: jest.fn(),
  };

  const courseProgressService = {
    reopenTopicProgressAndCourses: jest.fn(),
  };

  let service: QuizService;
  let insertedQuizzes: Array<Record<string, unknown>> = [];
  let insertedOptions: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    jest.clearAllMocks();
    insertedQuizzes = [];
    insertedOptions = [];

    prisma.topic.findMany.mockResolvedValue([{ id: 'topic-1' }]);
    prisma.quiz.findMany.mockImplementation(
      async (args: { where?: { topicId?: string; id?: { in: string[] } } }) => {
        if (args?.where?.id?.in) {
          return args.where.id.in.map((id) => {
            const row = insertedQuizzes.find((quiz) => quiz.id === id) as {
              id: string;
              quizCode: string;
              question: string;
              code: string | null;
              explanation: string | null;
              answer: string;
              imageUrl: string | null;
              imagePublicId: string | null;
              topicId: string;
            };
            return {
              ...row,
              topic: { id: row.topicId, name: 'Topic', slug: 'topic' },
              options: insertedOptions.filter((option) => option.quizId === id),
            };
          });
        }
        return [];
      },
    );
    prisma.quiz.createMany.mockImplementation(
      async ({ data }: { data: Array<Record<string, unknown>> }) => {
        insertedQuizzes = data;
        return { count: data.length };
      },
    );
    prisma.option.createMany.mockImplementation(
      async ({ data }: { data: Array<Record<string, unknown>> }) => {
        insertedOptions = data;
        return { count: data.length };
      },
    );
    prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    courseProgressService.reopenTopicProgressAndCourses.mockResolvedValue(0);

    service = new QuizService(
      prisma as never,
      minioService as never,
      courseProgressService as never,
    );
  });

  it('inserts a batch with createMany instead of per-quiz interactive creates', async () => {
    const result = await service.createQuizzes({
      quizzes: [quizPayload(0), quizPayload(1)],
    });

    expect(prisma.quiz.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
    expect(typeof prisma.$transaction.mock.calls[0][0]).not.toBe('function');
    expect(prisma.quiz.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.option.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.quiz.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(prisma.option.createMany.mock.calls[0][0].data).toHaveLength(8);
    expect(result.count).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      quizCode: 'q_001',
      answer: 'A',
    });
    expect(
      courseProgressService.reopenTopicProgressAndCourses,
    ).toHaveBeenCalledWith('topic-1');
  });

  it('keeps a 200-quiz import at two createMany calls', async () => {
    const quizzes = Array.from({ length: 200 }, (_, index) =>
      quizPayload(index),
    );

    const result = await service.createQuizzes({ quizzes });

    expect(prisma.quiz.create).not.toHaveBeenCalled();
    expect(prisma.quiz.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.option.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.quiz.createMany.mock.calls[0][0].data).toHaveLength(200);
    expect(prisma.option.createMany.mock.calls[0][0].data).toHaveLength(800);
    expect(result.count).toBe(200);
  });

  it('rejects a missing topic before writing', async () => {
    prisma.topic.findMany.mockResolvedValue([]);

    await expect(
      service.createQuizzes({ quizzes: [quizPayload(0)] }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.quiz.createMany).not.toHaveBeenCalled();
  });

  it('maps unique-constraint failures to ConflictException', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    prisma.$transaction.mockRejectedValue(uniqueError);

    await expect(
      service.createQuizzes({ quizzes: [quizPayload(0)] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
