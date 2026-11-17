import {
  classifyDifficulty,
  computeContentHash,
  inferSubject,
  TowerPoolService,
} from './tower-pool.service';

describe('TowerPoolService', () => {
  describe('Helper logic', () => {
    it('computeContentHash normalizes whitespace, lowercase, and code', () => {
      const hash1 = computeContentHash(
        '  SELECT *   from USERS  ',
        ' const a = 1; \n',
      );
      const hash2 = computeContentHash('select * from users', 'const a = 1;');
      expect(hash1).toEqual(hash2);
      expect(hash1).toHaveLength(64); // sha256 hex
    });

    it('inferSubject accurately identifies subject from course and topic', () => {
      expect(
        inferSubject({
          courseName: 'Web Frontend',
          topicName: 'Flexbox Layout',
          topicSlug: 'css-flexbox',
        }),
      ).toBe('HTML/CSS');

      expect(
        inferSubject({
          courseName: 'Fullstack TS',
          topicName: 'Async Await',
          topicSlug: 'js-async',
        }),
      ).toBe('JavaScript');

      expect(
        inferSubject({
          courseName: 'Database Design',
          topicName: 'Postgres Indexing',
          topicSlug: 'sql-indexes',
        }),
      ).toBe('SQL');

      expect(
        inferSubject({
          courseName: 'Học C cơ bản',
          topicName: 'Con trỏ trong C',
          topicSlug: 'c-pointers',
        }),
      ).toBe('C Programming');

      expect(
        inferSubject({
          topicName: 'Python for Data',
          topicSlug: 'python-intro',
        }),
      ).toBe('Python');

      expect(
        inferSubject({
          courseName: 'Algorithmic Thinking',
          topicName: 'Binary Trees',
          topicSlug: 'binary-trees',
        }),
      ).toBe('Algorithmic Thinking');
    });

    it('classifyDifficulty applies accuracy tiers when >= 3 attempts', () => {
      // 80% accuracy -> EASY
      expect(
        classifyDifficulty({ question: 'Easy Q' }, { total: 10, correct: 8 }),
      ).toBe('EASY');

      // 50% accuracy -> MEDIUM
      expect(
        classifyDifficulty({ question: 'Med Q' }, { total: 10, correct: 5 }),
      ).toBe('MEDIUM');

      // 20% accuracy -> HARD
      expect(
        classifyDifficulty({ question: 'Hard Q' }, { total: 10, correct: 2 }),
      ).toBe('HARD');
    });

    it('classifyDifficulty falls back to heuristics when attempts < 3', () => {
      // Short text, no code -> EASY
      expect(
        classifyDifficulty(
          { question: 'What is HTML?' },
          { total: 2, correct: 0 },
        ),
      ).toBe('EASY');

      // Long text, no code -> MEDIUM
      const longText = 'A'.repeat(160);
      expect(classifyDifficulty({ question: longText }, null)).toBe('MEDIUM');

      // Short code -> MEDIUM
      expect(
        classifyDifficulty({
          question: 'Run this',
          code: 'console.log(1);',
        }),
      ).toBe('MEDIUM');

      // Long code (> 150 chars) -> HARD
      expect(
        classifyDifficulty({
          question: 'Analyze complexity',
          code: 'const x = []; ' + 'x.push(Math.random()); '.repeat(10),
        }),
      ).toBe('HARD');
    });
  });

  describe('syncPool and getPoolStats', () => {
    let mockPrisma: any;
    let mockDistribution: any;
    let service: TowerPoolService;

    beforeEach(() => {
      mockPrisma = {
        towerCollectionJobLog: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'job-1', status: 'RUNNING' }),
          update: jest
            .fn()
            .mockResolvedValue({ id: 'job-1', status: 'SUCCESS' }),
          findFirst: jest.fn().mockResolvedValue({
            id: 'job-1',
            status: 'SUCCESS',
            startedAt: new Date(),
            completedAt: new Date(),
            totalCollected: 2,
            totalEligible: 2,
            totalDuplicates: 0,
            errorMessage: null,
          }),
        },
        quizAttempt: {
          groupBy: jest.fn().mockResolvedValue([
            { quizId: 'q1', isCorrect: true, _count: { id: 5 } },
            { quizId: 'q1', isCorrect: false, _count: { id: 1 } },
          ]),
        },
        quiz: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'q1',
              quizCode: 'Q1',
              question: 'HTML tag for paragraph',
              code: null,
              topicId: 't1',
              topic: {
                name: 'HTML Basics',
                slug: 'html-basics',
                endsAt: null,
                courseLinks: [
                  {
                    course: { id: 'c1', name: 'Web Dev', slug: 'web-dev' },
                  },
                ],
              },
            },
            {
              id: 'q2',
              quizCode: 'Q2',
              question: 'HTML tag for paragraph', // duplicate content
              code: null,
              topicId: 't1',
              topic: {
                name: 'HTML Basics',
                slug: 'html-basics',
                endsAt: null,
                courseLinks: [],
              },
            },
            {
              id: 'q3',
              quizCode: 'Q3',
              question: 'Expired topic question',
              code: null,
              topicId: 't2',
              topic: {
                name: 'Expired Topic',
                slug: 'expired-topic',
                endsAt: new Date(Date.now() - 100000), // expired
                courseLinks: [],
              },
            },
          ]),
        },
        towerQuestionPoolItem: {
          upsert: jest.fn().mockResolvedValue({ id: 'item-1' }),
          count: jest.fn().mockImplementation((args?: any) => {
            if (args?.where?.ineligibleReason === 'DUPLICATE_CONTENT') return 1;
            if (args?.where?.isEligible === true) return 1;
            return 3;
          }),
          groupBy: jest.fn().mockImplementation((args: any) => {
            if (args.by.includes('subject')) {
              return [{ subject: 'HTML/CSS', _count: { id: 2 } }];
            }
            if (args.by.includes('difficulty')) {
              return [{ difficulty: 'EASY', _count: { id: 2 } }];
            }
            if (args.by.includes('courseId')) {
              return [{ courseId: 'c1', _count: { id: 1 } }];
            }
            if (args.by.includes('topicId')) {
              return [{ topicId: 't1', _count: { id: 2 } }];
            }
            return [];
          }),
        },
        course: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'c1', name: 'Web Dev' }]),
        },
        topic: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 't1', name: 'HTML Basics' }]),
        },
        towerSeason: {
          findUnique: jest.fn().mockResolvedValue({
            id: 's-2026-11',
            seasonKey: '2026-11',
            isActive: true,
          }),
          findFirst: jest.fn().mockResolvedValue({
            id: 's-2026-11',
            seasonKey: '2026-11',
            isActive: true,
          }),
        },
        towerQuestionUsage: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ usageCount: 1 }, { usageCount: 2 }]),
        },
      };

      mockDistribution = {
        validateCoverage: jest.fn().mockResolvedValue({
          isSatisfied: true,
          coverageScore: 100,
          floorRanges: [],
          warnings: [],
        }),
      };

      service = new TowerPoolService(mockPrisma, mockDistribution);
    });

    it('syncPool collects quizzes, detects duplicates & expired windows, and logs execution', async () => {
      const res = await service.syncPool();

      expect(res.status).toBe('SUCCESS');
      expect(res.totalCollected).toBe(3);
      expect(res.totalEligible).toBe(1); // q1 is eligible, q2 is duplicate, q3 is expired
      expect(res.totalDuplicates).toBe(1);

      expect(mockPrisma.towerCollectionJobLog.create).toHaveBeenCalledWith({
        data: { status: 'RUNNING', startedAt: expect.any(Date) },
      });
      expect(mockPrisma.towerCollectionJobLog.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: {
          status: 'SUCCESS',
          totalCollected: 3,
          totalEligible: 1,
          totalDuplicates: 1,
          completedAt: expect.any(Date),
        },
      });

      // Verify q1 was upserted with isEligible: true
      expect(mockPrisma.towerQuestionPoolItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { quizId: 'q1' },
          create: expect.objectContaining({
            isEligible: true,
            subject: 'HTML/CSS',
          }),
        }),
      );

      // Verify q2 was marked DUPLICATE_CONTENT
      expect(mockPrisma.towerQuestionPoolItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { quizId: 'q2' },
          create: expect.objectContaining({
            isEligible: false,
            ineligibleReason: 'DUPLICATE_CONTENT',
          }),
        }),
      );

      // Verify q3 was marked TOPIC_CALENDAR_EXPIRED
      expect(mockPrisma.towerQuestionPoolItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { quizId: 'q3' },
          create: expect.objectContaining({
            isEligible: false,
            ineligibleReason: 'TOPIC_CALENDAR_EXPIRED',
          }),
        }),
      );
    });

    it('getPoolStats aggregates KPIs, breakdowns, anti-repeat and coverage', async () => {
      const stats = await service.getPoolStats('2026-11');

      expect(stats.kpis.totalCollected).toBe(3);
      expect(stats.kpis.totalEligible).toBe(1);
      expect(stats.kpis.totalDuplicates).toBe(1);
      expect(stats.antiRepeatStats.seasonKey).toBe('2026-11');
      expect(stats.antiRepeatStats.totalUsedInSeason).toBe(2);
      expect(stats.antiRepeatStats.reusedInSeason).toBe(1); // 1 item with usageCount > 1
      expect(stats.breakdown.bySubject).toBeDefined();
      expect(stats.breakdown.byDifficulty).toBeDefined();
      expect(stats.coverage.isSatisfied).toBe(true);
      expect(stats.lastJob?.status).toBe('SUCCESS');
    });
  });
});
