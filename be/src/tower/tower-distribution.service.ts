import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FloorDistributionRuleDto } from './dto/tower-admin.dto';

export interface FloorDistributionRule {
  minFloor: number;
  maxFloor: number;
  subjectWeights: Record<string, number>;
  difficultyWeights: Record<string, number>;
}

export interface DistributionCoverageReport {
  isSatisfied: boolean;
  coverageScore: number;
  totalEligible: number;
  floorRanges: {
    range: string;
    minFloor: number;
    maxFloor: number;
    requiredStreakMax: number;
    availableQuestions: number;
    subjectCoverage: Record<string, number>;
    difficultyCoverage: Record<string, number>;
    isSufficient: boolean;
    warnings: string[];
  }[];
  warnings: string[];
}

export const DEFAULT_TOWER_DISTRIBUTION_RULES: FloorDistributionRule[] = [
  {
    minFloor: 1,
    maxFloor: 30,
    subjectWeights: {
      'HTML/CSS': 100,
    },
    difficultyWeights: {
      EASY: 60,
      MEDIUM: 40,
      HARD: 0,
    },
  },
  {
    minFloor: 31,
    maxFloor: 70,
    subjectWeights: {
      'HTML/CSS': 70,
      JavaScript: 30,
    },
    difficultyWeights: {
      EASY: 10,
      MEDIUM: 70,
      HARD: 20,
    },
  },
  {
    minFloor: 71,
    maxFloor: 100,
    subjectWeights: {
      JavaScript: 70,
      'HTML/CSS': 30,
    },
    difficultyWeights: {
      EASY: 0,
      MEDIUM: 40,
      HARD: 60,
    },
  },
];

@Injectable()
export class TowerDistributionService implements OnModuleInit {
  private readonly logger = new Logger(TowerDistributionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaultConfigIfEmpty();
  }

  /**
   * Seeds the default distribution config if no active configuration exists.
   */
  async seedDefaultConfigIfEmpty() {
    try {
      const active = await this.prisma.towerDistributionConfig.findFirst({
        where: { isActive: true },
      });

      if (!active) {
        this.logger.log(
          'Seeding default active TowerDistributionConfig (Floors 1-100)',
        );
        await this.prisma.towerDistributionConfig.create({
          data: {
            name: 'Cấu hình phân bổ tri thức tháp mặc định (Tầng 1-100)',
            version: 1,
            isActive: true,
            rules: DEFAULT_TOWER_DISTRIBUTION_RULES as any,
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(
        `Could not seed default TowerDistributionConfig: ${err.message}`,
      );
    }
  }

  /**
   * Retrieves the currently active distribution config, seeding default if necessary.
   */
  async getActiveConfig() {
    let config = await this.prisma.towerDistributionConfig.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
    });

    if (!config) {
      await this.seedDefaultConfigIfEmpty();
      config = await this.prisma.towerDistributionConfig.findFirst({
        where: { isActive: true },
        orderBy: { version: 'desc' },
      });
    }

    return config;
  }

  /**
   * Updates or activates a new configuration ruleset.
   */
  async updateConfig(rules: FloorDistributionRuleDto[], name?: string) {
    const current = await this.getActiveConfig();
    const nextVersion = current ? current.version + 1 : 1;

    // Deactivate previous configs
    await this.prisma.towerDistributionConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    const newConfig = await this.prisma.towerDistributionConfig.create({
      data: {
        name: name || `Cấu hình phân bổ v${nextVersion}`,
        version: nextVersion,
        isActive: true,
        rules: rules as any,
      },
    });

    return newConfig;
  }

  /**
   * Validates question pool coverage against the given or currently active rules.
   */
  async validateCoverage(
    rulesOverride?: FloorDistributionRule[],
  ): Promise<DistributionCoverageReport> {
    const active = await this.getActiveConfig();
    const rules: FloorDistributionRule[] =
      rulesOverride ||
      (active?.rules as unknown as FloorDistributionRule[]) ||
      DEFAULT_TOWER_DISTRIBUTION_RULES;

    // Fetch pool items counts grouped by subject and difficulty
    const eligibleItems = await this.prisma.towerQuestionPoolItem.findMany({
      where: { isEligible: true },
      select: {
        subject: true,
        difficulty: true,
      },
    });

    const totalEligible = eligibleItems.length;

    // Build subject map and difficulty map
    const subjectCounts: Record<string, number> = {};
    const difficultyCounts: Record<string, number> = {};

    for (const item of eligibleItems) {
      subjectCounts[item.subject] = (subjectCounts[item.subject] || 0) + 1;
      difficultyCounts[item.difficulty] =
        (difficultyCounts[item.difficulty] || 0) + 1;
    }

    const allWarnings: string[] = [];
    const floorRanges = [];
    let satisfiedRanges = 0;

    for (const rule of rules) {
      const rangeLabel = `${rule.minFloor}–${rule.maxFloor}`;
      const requiredStreakMax = rule.maxFloor;
      const rangeWarnings: string[] = [];

      // Calculate matching available questions for this rule
      let matchingCount = 0;
      const rangeSubjectCoverage: Record<string, number> = {};
      const rangeDifficultyCoverage: Record<string, number> = {};

      for (const [sub, weight] of Object.entries(rule.subjectWeights || {})) {
        if (weight > 0) {
          // Normalize alias CSS / HTML/CSS
          const available = this.getAvailableCountForSubject(
            sub,
            subjectCounts,
          );
          rangeSubjectCoverage[sub] = available;
          matchingCount += available;

          if (available === 0) {
            rangeWarnings.push(
              `Chủ đề '${sub}' (tỷ trọng ${weight}%) hiện chưa có câu hỏi hợp lệ trong pool`,
            );
          } else if (available < 5) {
            rangeWarnings.push(
              `Chủ đề '${sub}' có ít hơn 5 câu hỏi khả dụng (${available} câu)`,
            );
          }
        }
      }

      for (const [diff, weight] of Object.entries(
        rule.difficultyWeights || {},
      )) {
        if (weight > 0) {
          const available = difficultyCounts[diff] || 0;
          rangeDifficultyCoverage[diff] = available;
          if (available === 0) {
            rangeWarnings.push(
              `Độ khó '${diff}' (tỷ trọng ${weight}%) hiện chưa có câu hỏi nào`,
            );
          }
        }
      }

      // Check if total matching questions is sufficient for this floor range streak
      const isSufficient = matchingCount >= requiredStreakMax;
      if (!isSufficient) {
        rangeWarnings.push(
          `Tổng câu hỏi khả dụng (${matchingCount}) thấp hơn chuỗi yêu cầu tối đa của tầng ${rule.maxFloor} (${requiredStreakMax})`,
        );
      } else {
        satisfiedRanges++;
      }

      allWarnings.push(...rangeWarnings);

      floorRanges.push({
        range: rangeLabel,
        minFloor: rule.minFloor,
        maxFloor: rule.maxFloor,
        requiredStreakMax,
        availableQuestions: matchingCount,
        subjectCoverage: rangeSubjectCoverage,
        difficultyCoverage: rangeDifficultyCoverage,
        isSufficient,
        warnings: rangeWarnings,
      });
    }

    const coverageScore =
      rules.length > 0
        ? Math.round((satisfiedRanges / rules.length) * 100)
        : 100;
    const isSatisfied = floorRanges.every(
      (r) => r.isSufficient && r.warnings.length === 0,
    );

    return {
      isSatisfied,
      coverageScore,
      totalEligible,
      floorRanges,
      warnings: allWarnings,
    };
  }

  private getAvailableCountForSubject(
    subject: string,
    counts: Record<string, number>,
  ): number {
    if (counts[subject] !== undefined) {
      return counts[subject];
    }
    const lower = subject.toLowerCase();
    let sum = 0;
    for (const [k, v] of Object.entries(counts)) {
      if (
        k.toLowerCase() === lower ||
        (lower.includes('css') && k.toLowerCase().includes('css'))
      ) {
        sum += v;
      }
    }
    return sum;
  }
}
