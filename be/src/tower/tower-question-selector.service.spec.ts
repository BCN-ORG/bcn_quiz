import { TowerQuestionSelector } from './tower-question-selector.service';
import { DEFAULT_TOWER_DISTRIBUTION_RULES } from './tower-distribution.service';

describe('TowerQuestionSelector', () => {
  let selector: TowerQuestionSelector;
  let mockPrisma: any;
  let mockDistribution: any;

  beforeEach(() => {
    mockDistribution = {
      getActiveConfig: jest.fn().mockResolvedValue({
        id: 'cfg-1',
        version: 1,
        isActive: true,
        rules: DEFAULT_TOWER_DISTRIBUTION_RULES,
      }),
    };

    mockPrisma = {
      towerQuestionPoolItem: {
        count: jest.fn(),
        findFirst: jest.fn(),
      },
      towerQuestionUsage: {
        findMany: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'usage-1' }),
      },
      quiz: {
        count: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    selector = new TowerQuestionSelector(mockPrisma, mockDistribution);
  });

  describe('Monthly Anti-Repeat Priorities', () => {
    it('Priority 1: Selects question never used in ANY season when available', async () => {
      // Priority 1 count > 0
      mockPrisma.towerQuestionPoolItem.count.mockResolvedValueOnce(2);
      mockPrisma.towerQuestionPoolItem.findFirst.mockResolvedValueOnce({
        quiz: {
          id: 'q-never-used',
          question: 'What is semantic HTML?',
          options: [{ label: 'A', content: '<article>' }],
        },
      });

      const result = await selector.selectQuestionForFloor(
        'season-2026-11',
        5,
        [],
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe('q-never-used');

      // Verify count was called with towerUsages: { none: {} }
      expect(mockPrisma.towerQuestionPoolItem.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            quiz: { towerUsages: { none: {} } },
          }),
        }),
      );

      // Verify usage was atomically tracked
      expect(mockPrisma.towerQuestionUsage.upsert).toHaveBeenCalledWith({
        where: {
          quizId_seasonId: {
            quizId: 'q-never-used',
            seasonId: 'season-2026-11',
          },
        },
        create: {
          quizId: 'q-never-used',
          seasonId: 'season-2026-11',
          floor: 5,
          usedAt: expect.any(Date),
          usageCount: 1,
        },
        update: {
          floor: 5,
          usedAt: expect.any(Date),
          usageCount: { increment: 1 },
        },
      });
    });

    it('Priority 2: Selects question not used in CURRENT season when Priority 1 is empty', async () => {
      // Priority 1 (never used anywhere) count is 0
      mockPrisma.towerQuestionPoolItem.count
        .mockResolvedValueOnce(0) // P1: 0
        .mockResolvedValueOnce(3); // P2: 3

      mockPrisma.towerQuestionPoolItem.findFirst.mockResolvedValueOnce({
        quiz: {
          id: 'q-unused-this-season',
          question: 'What is CSS box-sizing?',
          options: [{ label: 'A', content: 'border-box' }],
        },
      });

      const result = await selector.selectQuestionForFloor(
        'season-2026-11',
        10,
        ['q-old'],
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe('q-unused-this-season');

      // Verify P2 called with towerUsages: { none: { seasonId: 'season-2026-11' } }
      expect(mockPrisma.towerQuestionPoolItem.count).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            quiz: { towerUsages: { none: { seasonId: 'season-2026-11' } } },
          }),
        }),
      );
    });

    it('Priority 3: Falls back to least recently used question in current season (LRU)', async () => {
      // Both P1 and P2 return 0
      mockPrisma.towerQuestionPoolItem.count
        .mockResolvedValueOnce(0) // P1
        .mockResolvedValueOnce(0); // P2

      mockPrisma.towerQuestionUsage.findMany.mockResolvedValueOnce([
        {
          id: 'u1',
          usageCount: 1,
          usedAt: new Date(Date.now() - 50000),
          quiz: {
            id: 'q-least-used',
            question: 'CSS flex direction',
            options: [{ label: 'A', content: 'row' }],
          },
        },
      ]);

      const result = await selector.selectQuestionForFloor(
        'season-2026-11',
        20,
        [],
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe('q-least-used');

      // Verify LRU query ordered by usageCount asc, usedAt asc
      expect(mockPrisma.towerQuestionUsage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ usageCount: 'asc' }, { usedAt: 'asc' }],
        }),
      );
    });

    it('Priority 4: When entire pool is exhausted within current streak, relaxes excludeIds to prevent stalling', async () => {
      // When all excludeQuizIds are filtered out and P1, P2, P3 return nothing:
      mockPrisma.towerQuestionPoolItem.count.mockResolvedValue(0);
      mockPrisma.towerQuestionUsage.findMany.mockResolvedValue([]);

      // Legacy fallback kicks in
      mockPrisma.quiz.count.mockResolvedValueOnce(1);
      mockPrisma.quiz.findFirst.mockResolvedValueOnce({
        id: 'q-fallback',
        question: 'Fallback Q',
        options: [{ label: 'A', content: '1' }],
      });

      const result = await selector.selectQuestionForFloor(
        'season-2026-11',
        1,
        ['q1', 'q2', 'q3'],
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe('q-fallback');
    });
  });
});
