import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TopicService } from './topic.service';

describe('TopicService', () => {
  const prisma = {
    topic: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    quiz: { findMany: jest.fn(), count: jest.fn() },
    course: { findUnique: jest.fn() },
    courseTopic: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const minioService = {};
  const courseProgressService = {
    reevaluateAllUsersForCourse: jest.fn(),
  };

  let service: TopicService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TopicService(
      prisma as never,
      minioService as never,
      courseProgressService as never,
    );
  });

  describe('resolveTopicBySlug', () => {
    it('resolves uniquely when courseId is provided and adds availability', async () => {
      prisma.courseTopic.findFirst.mockResolvedValue({
        topic: {
          id: 't1',
          slug: 'intro',
          startsAt: null,
          endsAt: null,
          _count: { quizzes: 2 },
        },
      });

      const topic = await service.getTopicBySlug('intro', 'course-1');

      expect(topic).toEqual({
        id: 't1',
        slug: 'intro',
        startsAt: null,
        endsAt: null,
        _count: { quizzes: 2 },
        availability: 'OPEN',
      });
      expect(prisma.courseTopic.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { courseId: 'course-1', topic: { slug: 'intro' } },
        }),
      );
    });

    it('throws ConflictException when slug exists in multiple courses', async () => {
      prisma.topic.findMany.mockResolvedValue([
        { id: 't1', slug: 'intro' },
        { id: 't2', slug: 'intro' },
      ]);

      await expect(service.getTopicBySlug('intro')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws NotFoundException when slug is unknown', async () => {
      prisma.topic.findMany.mockResolvedValue([]);

      await expect(service.getTopicBySlug('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('keeps option order stable within a session without exposing answers', async () => {
    prisma.topic.findUnique.mockResolvedValue({ id: 't1' });
    prisma.quiz.count.mockResolvedValue(1);
    prisma.quiz.findMany.mockResolvedValue([
      {
        id: 'q1',
        quizCode: 'Q1',
        question: 'Question',
        answer: 'A',
        explanation: 'Secret',
        options: [
          { id: 'o1', label: 'A', content: 'One', isCode: false },
          { id: 'o2', label: 'B', content: 'Two', isCode: false },
          { id: 'o3', label: 'C', content: 'Three', isCode: false },
        ],
      },
    ]);

    const first = await service.getQuizzesByTopicId('t1', {
      sessionId: 'session-1',
    });
    const second = await service.getQuizzesByTopicId('t1', {
      sessionId: 'session-1',
    });

    expect(second.items[0].options).toEqual(first.items[0].options);
    expect(first.items[0]).not.toHaveProperty('answer');
    expect(first.items[0]).not.toHaveProperty('explanation');
  });

  describe('schedule window validation', () => {
    it('rejects create when startsAt >= endsAt', async () => {
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
      prisma.courseTopic.findFirst.mockResolvedValue(null);

      await expect(
        service.createTopic({
          name: 'T',
          slug: 't',
          courseId: 'course-1',
          startsAt: new Date('2026-09-08T10:00:00.000Z'),
          endsAt: new Date('2026-09-08T08:00:00.000Z'),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects update when merged window is invalid', async () => {
      prisma.topic.findUnique
        .mockResolvedValueOnce({ id: 't1' })
        .mockResolvedValueOnce({
          startsAt: new Date('2026-09-08T08:00:00.000Z'),
          endsAt: new Date('2026-09-08T10:00:00.000Z'),
          imagePublicId: null,
        });

      await expect(
        service.updateTopic('t1', {
          endsAt: new Date('2026-09-08T07:00:00.000Z'),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
