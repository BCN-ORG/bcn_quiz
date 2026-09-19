import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../common/storage/minio.service';
import { CourseProgressService } from '../course/course-progress.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { CreateUploadSignatureDto } from './dto/create-upload-signature.dto';
import {
  validateTopicScheduleWindow,
  withTopicAvailability,
} from './topic-schedule';

type RawQuiz = {
  id: string;
  quizCode: string;
  content: {
    text: string;
    code: string;
    has_code: boolean;
    image: string | null;
    has_image: boolean;
  };
  options: {
    is_code: boolean;
    data: Record<string, string>;
  };
  answer: string;
  explanation: string;
  imagePublicId: string | null;
};

function mapQuiz(raw: RawQuiz) {
  return {
    id: raw.id,
    quizCode: raw.quizCode,
    content: {
      text: raw.content.text,
      code: raw.content.code,
      has_code: raw.content.has_code,
      image: raw.content.image,
      has_image: raw.content.has_image,
    },
    options: {
      is_code: raw.options.is_code,
      data: raw.options.data,
    },
    answer: raw.answer,
    explanation: raw.explanation,
    imagePublicId: raw.imagePublicId,
  };
}

/** Public variant — omits answer and explanation for quiz-taking endpoints */
function mapQuizPublic(raw: RawQuiz) {
  return {
    id: raw.id,
    quizCode: raw.quizCode,
    content: {
      text: raw.content.text,
      code: raw.content.code,
      has_code: raw.content.has_code,
      image: raw.content.image,
      has_image: raw.content.has_image,
    },
    options: {
      is_code: raw.options.is_code,
      data: raw.options.data,
    },
  };
}

function toRawQuiz(quiz: any): RawQuiz {
  return {
    id: quiz.id,
    quizCode: quiz.quizCode,
    content: {
      text: quiz.question,
      code: quiz.code ?? '',
      has_code: Boolean(quiz.code),
      image: quiz.imageUrl ?? null,
      has_image: Boolean(quiz.imageUrl),
    },
    options: {
      is_code: (quiz.options ?? []).some((option: any) => option.isCode),
      data: Object.fromEntries(
        (quiz.options ?? []).map((option: any) => [
          option.label,
          option.content,
        ]),
      ),
    },
    answer: quiz.answer,
    explanation: quiz.explanation ?? '',
    imagePublicId: quiz.imagePublicId ?? null,
  };
}

@Injectable()
export class TopicService {
  private readonly logger = new Logger(TopicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
    private readonly courseProgressService: CourseProgressService,
  ) {}

  async getQuizzesByTopicId(topicId: string, query: PaginationQueryDto) {
    const { items, pagination } = await this.fetchQuizzesPageByTopicId(
      topicId,
      query,
    );

    return {
      items: items.map((quiz) => mapQuizPublic(toRawQuiz(quiz))),
      pagination,
    };
  }

  /**
   * Admin variant — includes answer/explanation in each item so the admin UI
   * can display and edit the current correct answer of every quiz.
   */
  async getQuizzesWithAnswersByTopicId(
    topicId: string,
    query: PaginationQueryDto,
  ) {
    const { items, pagination } = await this.fetchQuizzesPageByTopicId(
      topicId,
      query,
    );

    return {
      items: items.map((quiz) => mapQuiz(toRawQuiz(quiz))),
      pagination,
    };
  }

  private async fetchQuizzesPageByTopicId(
    topicId: string,
    query: PaginationQueryDto,
    options?: { skipEnsure?: boolean },
  ) {
    if (!options?.skipEnsure) {
      await this.ensureTopicExists(topicId);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.quiz.findMany({
        where: {
          topicId,
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          options: true,
        },
      }),
      this.prisma.quiz.count({
        where: {
          topicId,
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async getQuizzesByTopicSlug(
    slug: string,
    query: PaginationQueryDto,
    courseId?: string,
  ) {
    const topic = await this.resolveTopicBySlug(slug, courseId);

    // Topic already resolved by slug — skip duplicate ensureTopicExists round-trip.
    const { items, pagination } = await this.fetchQuizzesPageByTopicId(
      topic.id,
      query,
      { skipEnsure: true },
    );

    return {
      items: items.map((quiz) => mapQuizPublic(toRawQuiz(quiz))),
      pagination,
    };
  }

  async getAllTopics(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    type TopicListRow = {
      id: string;
      name: string;
      slug: string;
      imageUrl: string | null;
      imagePublicId: string | null;
      startsAt: Date | null;
      endsAt: Date | null;
      createdAt: Date;
      quiz_count: number;
      total_count: number;
    };

    const rows = await this.prisma.$queryRaw<TopicListRow[]>`
      SELECT
        t.id,
        t.name,
        t.slug,
        t."imageUrl",
        t."imagePublicId",
        t."startsAt",
        t."endsAt",
        t."createdAt",
        (
          SELECT COUNT(*)::int FROM quizzes z WHERE z."topicId" = t.id
        ) AS quiz_count,
        COUNT(*) OVER()::int AS total_count
      FROM topics t
      ORDER BY t."createdAt" DESC
      LIMIT ${limit} OFFSET ${skip}
    `;

    const total = rows[0]?.total_count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items: rows.map((row) =>
        withTopicAvailability({
          id: row.id,
          name: row.name,
          slug: row.slug,
          imageUrl: row.imageUrl,
          imagePublicId: row.imagePublicId,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          createdAt: row.createdAt,
          _count: { quizzes: row.quiz_count },
        }),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async getTopicById(id: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            quizzes: true,
          },
        },
      },
    });

    if (!topic) {
      throw new NotFoundException(`Topic with id '${id}' was not found`);
    }

    return withTopicAvailability(topic);
  }

  async getTopicBySlug(slug: string, courseId?: string) {
    const topic = await this.resolveTopicBySlug(slug, courseId, {
      includeCount: true,
    });

    return withTopicAvailability(topic);
  }

  /**
   * Resolve a topic slug. Prefer `courseId` when the same slug may exist in
   * multiple courses. Without courseId, ambiguous slugs raise ConflictException.
   */
  private async resolveTopicBySlug(
    slug: string,
    courseId?: string,
    options?: { includeCount?: boolean },
  ) {
    const include = options?.includeCount
      ? {
          _count: {
            select: {
              quizzes: true,
            },
          },
        }
      : undefined;

    if (courseId?.trim()) {
      const link = await this.prisma.courseTopic.findFirst({
        where: {
          courseId,
          topic: { slug },
        },
        select: {
          topic: {
            include,
          },
        },
      });

      if (!link?.topic) {
        throw new NotFoundException(
          `Topic with slug '${slug}' was not found in course '${courseId}'`,
        );
      }

      return link.topic;
    }

    const matches = await this.prisma.topic.findMany({
      where: { slug },
      orderBy: { createdAt: 'desc' },
      take: 2,
      include,
    });

    if (matches.length === 0) {
      throw new NotFoundException(`Topic with slug '${slug}' was not found`);
    }

    if (matches.length > 1) {
      throw new ConflictException(
        `Topic slug '${slug}' exists in multiple courses; pass courseId to disambiguate`,
      );
    }

    return matches[0];
  }

  async createTopic(data: CreateTopicDto) {
    await this.ensureSlugUniqueInCourse(data.courseId, data.slug);
    await this.ensureCourseExists(data.courseId);
    validateTopicScheduleWindow(data.startsAt ?? null, data.endsAt ?? null);

    if (data.imageUrl || data.imagePublicId) {
      await this.validateImageFields(data.imageUrl, data.imagePublicId);
    }

    const topic = await this.prisma.$transaction(async (tx) => {
      const created = await tx.topic.create({
        data: {
          name: data.name,
          slug: data.slug,
          imageUrl: data.imageUrl ?? null,
          imagePublicId: data.imagePublicId ?? null,
          startsAt: data.startsAt ?? null,
          endsAt: data.endsAt ?? null,
        },
      });

      const lastCourseTopic = await tx.courseTopic.findFirst({
        where: { courseId: data.courseId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });

      const sortOrder = (lastCourseTopic?.sortOrder ?? 0) + 1;

      await tx.courseTopic.create({
        data: {
          courseId: data.courseId,
          topicId: created.id,
          sortOrder,
        },
      });

      return created;
    });

    await this.courseProgressService.reevaluateAllUsersForCourse(data.courseId);

    return withTopicAvailability(topic);
  }

  async updateTopic(id: string, data: UpdateTopicDto) {
    await this.ensureTopicExists(id);

    if (data.slug) {
      await this.ensureSlugUniqueForLinkedCourses(id, data.slug);
    }

    if (data.imageUrl || data.imagePublicId) {
      await this.validateImageFields(data.imageUrl, data.imagePublicId);
    }

    const existingSchedule = await this.prisma.topic.findUnique({
      where: { id },
      select: {
        startsAt: true,
        endsAt: true,
        imagePublicId: true,
      },
    });

    if (!existingSchedule) {
      throw new NotFoundException(`Topic with id '${id}' was not found`);
    }

    const nextStartsAt =
      data.startsAt !== undefined ? data.startsAt : existingSchedule.startsAt;
    const nextEndsAt =
      data.endsAt !== undefined ? data.endsAt : existingSchedule.endsAt;
    validateTopicScheduleWindow(nextStartsAt, nextEndsAt);

    // If a new image is provided, delete the old one from MinIO
    if (data.imagePublicId) {
      if (
        existingSchedule.imagePublicId &&
        existingSchedule.imagePublicId !== data.imagePublicId
      ) {
        await this.deleteMinioImage(existingSchedule.imagePublicId);
      }
    }

    const updated = await this.prisma.topic.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.imagePublicId !== undefined && {
          imagePublicId: data.imagePublicId,
        }),
        ...(data.startsAt !== undefined && { startsAt: data.startsAt }),
        ...(data.endsAt !== undefined && { endsAt: data.endsAt }),
      },
    });

    return withTopicAvailability(updated);
  }

  async deleteTopic(id: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id },
      select: { id: true, imagePublicId: true },
    });

    if (!topic) {
      throw new NotFoundException(`Topic with id '${id}' was not found`);
    }

    const linkedCourses = await this.prisma.courseTopic.findMany({
      where: { topicId: id },
      select: { courseId: true },
    });

    await this.prisma.topic.delete({ where: { id } });

    if (topic.imagePublicId) {
      await this.deleteMinioImage(topic.imagePublicId);
    }

    for (const link of linkedCourses) {
      await this.courseProgressService.reevaluateAllUsersForCourse(
        link.courseId,
      );
    }

    return { id, deleted: true };
  }

  createUploadSignature(dto: CreateUploadSignatureDto) {
    const folder = (
      process.env.MINIO_TOPIC_IMAGE_FOLDER ?? 'topic-images'
    ).replace(/^\/+|\/+$/g, '');
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = dto.publicId?.trim()
      ? this.sanitizePublicId(dto.publicId)
      : undefined;

    return this.minioService.createUploadSignature({
      timestamp,
      folder,
      publicId,
      includeMaxBytes: true,
    });
  }

  private async ensureSlugUniqueInCourse(
    courseId: string,
    slug: string,
    currentTopicId?: string,
  ) {
    const existing = await this.prisma.courseTopic.findFirst({
      where: {
        courseId,
        topic: {
          slug,
          ...(currentTopicId ? { id: { not: currentTopicId } } : {}),
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        `Topic slug '${slug}' already exists in this course`,
      );
    }
  }

  private async ensureSlugUniqueForLinkedCourses(
    topicId: string,
    slug: string,
  ) {
    const links = await this.prisma.courseTopic.findMany({
      where: { topicId },
      select: { courseId: true },
    });

    for (const link of links) {
      await this.ensureSlugUniqueInCourse(link.courseId, slug, topicId);
    }
  }

  private async ensureTopicExists(id: string) {
    const existing = await this.prisma.topic.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Topic with id '${id}' was not found`);
    }
  }

  private async ensureCourseExists(id: string) {
    const existing = await this.prisma.course.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Course with id '${id}' was not found`);
    }
  }

  private async validateImageFields(
    imageUrl?: string,
    imagePublicId?: string,
  ): Promise<void> {
    if ((imageUrl && !imagePublicId) || (!imageUrl && imagePublicId)) {
      throw new BadRequestException(
        'imageUrl and imagePublicId must be provided together',
      );
    }

    if (imageUrl) {
      this.minioService.assertObjectUrl(imageUrl, imagePublicId!);
    }

    if (imagePublicId) {
      await this.minioService.assertImageWithinMaxBytes(imagePublicId);
    }
  }

  private sanitizePublicId(input: string): string {
    const trimmed = input.trim();
    const sanitized = trimmed
      .replace(/[^a-zA-Z0-9/_-]/g, '_')
      .replace(/^\/+|\/+$/g, '');

    if (!sanitized) {
      throw new BadRequestException('publicId is invalid');
    }

    return sanitized;
  }

  private async deleteMinioImage(publicId: string): Promise<void> {
    try {
      await this.minioService.deleteRawFile(publicId);
    } catch {
      this.logger.warn(`Failed to delete MinIO image '${publicId}'`);
    }
  }
}
