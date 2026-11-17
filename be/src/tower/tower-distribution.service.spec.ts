import {
  DEFAULT_TOWER_DISTRIBUTION_RULES,
  TowerDistributionService,
} from './tower-distribution.service';

describe('TowerDistributionService', () => {
  let service: TowerDistributionService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      towerDistributionConfig: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      towerQuestionPoolItem: {
        findMany: jest.fn(),
      },
    };

    service = new TowerDistributionService(mockPrisma);
  });

  it('seeds default active distribution configuration when none exists', async () => {
    mockPrisma.towerDistributionConfig.findFirst.mockResolvedValue(null);
    mockPrisma.towerDistributionConfig.create.mockResolvedValue({
      id: 'cfg-1',
      version: 1,
      isActive: true,
      rules: DEFAULT_TOWER_DISTRIBUTION_RULES,
    });

    await service.seedDefaultConfigIfEmpty();

    expect(mockPrisma.towerDistributionConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 1,
          isActive: true,
          rules: DEFAULT_TOWER_DISTRIBUTION_RULES,
        }),
      }),
    );
  });

  it('updateConfig deactivates previous and creates next version', async () => {
    mockPrisma.towerDistributionConfig.findFirst.mockResolvedValue({
      id: 'cfg-1',
      version: 1,
      isActive: true,
      rules: DEFAULT_TOWER_DISTRIBUTION_RULES,
    });

    const newRules = [
      {
        minFloor: 1,
        maxFloor: 50,
        subjectWeights: { 'HTML/CSS': 100 },
        difficultyWeights: { EASY: 100, MEDIUM: 0, HARD: 0 },
      },
      {
        minFloor: 51,
        maxFloor: 100,
        subjectWeights: { JavaScript: 100 },
        difficultyWeights: { EASY: 0, MEDIUM: 50, HARD: 50 },
      },
    ];

    mockPrisma.towerDistributionConfig.create.mockResolvedValue({
      id: 'cfg-2',
      version: 2,
      isActive: true,
      rules: newRules,
    });

    const updated = await service.updateConfig(newRules, 'Custom Config v2');

    expect(mockPrisma.towerDistributionConfig.updateMany).toHaveBeenCalledWith({
      where: { isActive: true },
      data: { isActive: false },
    });

    expect(mockPrisma.towerDistributionConfig.create).toHaveBeenCalledWith({
      data: {
        name: 'Custom Config v2',
        version: 2,
        isActive: true,
        rules: newRules,
      },
    });

    expect(updated.version).toBe(2);
  });

  it('validateCoverage detects sufficient and insufficient question coverage', async () => {
    mockPrisma.towerDistributionConfig.findFirst.mockResolvedValue({
      id: 'cfg-1',
      version: 1,
      isActive: true,
      rules: DEFAULT_TOWER_DISTRIBUTION_RULES,
    });

    // Provide questions: 35 HTML/CSS (enough for 1-30, but 31-70 needs 70 questions and JavaScript)
    const items = [
      ...Array.from({ length: 35 }, () => ({
        subject: 'HTML/CSS',
        difficulty: 'EASY',
      })),
    ];
    mockPrisma.towerQuestionPoolItem.findMany.mockResolvedValue(items);

    const report = await service.validateCoverage();

    expect(report.totalEligible).toBe(35);
    expect(report.floorRanges).toHaveLength(3);

    // Floor 1-30 has 35 questions (>= 30 maxFloor required streak) -> sufficient
    expect(report.floorRanges[0].range).toBe('1–30');
    expect(report.floorRanges[0].isSufficient).toBe(true);

    // Floor 31-70 requires 70 questions and JavaScript which is missing -> warning and insufficient
    expect(report.floorRanges[1].range).toBe('31–70');
    expect(report.floorRanges[1].isSufficient).toBe(false);
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.isSatisfied).toBe(false);
  });
});
