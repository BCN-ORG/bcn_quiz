import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CourseProgressStatus,
  Prisma,
  ProjectSubmissionStatus,
} from '@prisma/client';
import type { Request as ExpressRequest } from 'express';
import { extname } from 'path';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateProjectSubmissionDto } from './dto/create-project-submission.dto';
import { CreateUploadSignatureDto } from './dto/create-upload-signature.dto';
import { ListProjectSubmissionsQueryDto } from './dto/list-project-submissions-query.dto';
import {
  MyCourseProgressQueryDto,
  MyCourseProgressScope,
} from './dto/my-course-progress-query.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { ProjectSubmissionFileMetadataDto } from './dto/project-submission-file-metadata.dto';
import { ReviewDecision, ReviewProjectSubmissionDto } from './dto/review-project-submission.dto';
import { UpdateProjectSubmissionDto } from './dto/update-project-submission.dto';
import { UpdateCourseTopicsDto } from './dto/update-course-topics.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UpsertCourseProjectDto } from './dto/upsert-course-project.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CourseProgressService } from './course-progress.service';
import { CloudinaryService } from '../common/storage/cloudinary.service';
import { withTopicAvailability } from '../topic/topic-schedule';

const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.zip', '.rar', '.pdf', '.docx']);
const MAX_PROJECT_FILES = 5;
const MAX_PROJECT_FILE_SIZE = 20 * 1024 * 1024;

type ProjectSubmissionWithFiles = Prisma.ProjectSubmissionGetPayload<{
  include: {
    files: true;
  };
}>;

type ValidatedProjectFileMetadata = {
  secureUrl: string;
  publicId: string;
  originalName: string;
  mimeType?: string;
  fileSize?: number;
};

@Injectable()
export class CourseService {
  private readonly logger = new Logger(CourseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly courseProgressService: CourseProgressService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async getAllCourses(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    type CourseListRow = {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      imageUrl: string | null;
      imagePublicId: string | null;
      hasProject: boolean;
      topicWeight: number;
      projectWeight: number;
      createdAt: Date;
      updatedAt: Date;
      topic_count: number;
      submission_count: number;
      certificate_count: number;
      req_id: string | null;
      req_title: string | null;
      req_description: string | null;
      req_is_required: boolean | null;
      req_attachment_url: string | null;
      req_attachment_public_id: string | null;
      req_attachment_original_name: string | null;
      req_created_at: Date | null;
      req_updated_at: Date | null;
      total_count: number;
    };

    const rows = await this.prisma.$queryRaw<CourseListRow[]>`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.description,
        c."imageUrl",
        c."imagePublicId",
        c."hasProject",
        c."topicWeight",
        c."projectWeight",
        c."createdAt",
        c."updatedAt",
        (SELECT COUNT(*)::int FROM course_topics ct WHERE ct."courseId" = c.id) AS topic_count,
        (SELECT COUNT(*)::int FROM project_submissions ps WHERE ps."courseId" = c.id) AS submission_count,
        (SELECT COUNT(*)::int FROM certificates cert WHERE cert."courseId" = c.id) AS certificate_count,
        pr.id AS req_id,
        pr.title AS req_title,
        pr.description AS req_description,
        pr."isRequired" AS req_is_required,
        pr."attachmentUrl" AS req_attachment_url,
        pr."attachmentPublicId" AS req_attachment_public_id,
        pr."attachmentOriginalName" AS req_attachment_original_name,
        pr."createdAt" AS req_created_at,
        pr."updatedAt" AS req_updated_at,
        COUNT(*) OVER()::int AS total_count
      FROM courses c
      LEFT JOIN course_project_requirements pr ON pr."courseId" = c.id
      ORDER BY c."createdAt" DESC
      LIMIT ${limit} OFFSET ${skip}
    `;

    const total = rows[0]?.total_count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        imageUrl: row.imageUrl,
        imagePublicId: row.imagePublicId,
        hasProject: row.hasProject,
        topicWeight: row.topicWeight,
        projectWeight: row.projectWeight,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        _count: {
          topics: row.topic_count,
          submissions: row.submission_count,
          certificates: row.certificate_count,
        },
        projectRequirement: row.req_id
          ? {
              id: row.req_id,
              title: row.req_title,
              description: row.req_description,
              isRequired: row.req_is_required,
              attachmentUrl: row.req_attachment_url,
              attachmentPublicId: row.req_attachment_public_id,
              attachmentOriginalName: row.req_attachment_original_name,
              createdAt: row.req_created_at,
              updatedAt: row.req_updated_at,
            }
          : null,
      })),
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

  async getCourseById(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        topics: {
          // sortOrder cao hơn = mới hơn, hiển thị trước (giống course list)
          orderBy: {
            sortOrder: 'desc',
          },
          include: {
            topic: true,
          },
        },
        projectRequirement: true,
      },
    });

    if (!course) {
      throw new NotFoundException(`Course with id '${id}' was not found`);
    }

    return this.withCourseTopicAvailability(course);
  }

  async getCourseBySlug(slug: string) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        topics: {
          // sortOrder cao hơn = mới hơn, hiển thị trước (giống course list)
          orderBy: {
            sortOrder: 'desc',
          },
          include: {
            topic: true,
          },
        },
        projectRequirement: true,
      },
    });

    if (!course) {
      throw new NotFoundException(`Course with slug '${slug}' was not found`);
    }

    return this.withCourseTopicAvailability(course);
  }

  async getCourseTopics(courseId: string, query: PaginationQueryDto) {
    await this.ensureCourseExists(courseId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.courseTopic.findMany({
        where: { courseId },
        skip,
        take: limit,
        // sortOrder cao hơn = mới hơn, hiển thị trước (giống course list)
        orderBy: {
          sortOrder: 'desc',
        },
        include: {
          topic: {
            include: {
              _count: {
                select: {
                  quizzes: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.courseTopic.count({
        where: { courseId },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items: items.map((item) => ({
        ...item,
        topic: withTopicAvailability(item.topic),
      })),
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

  async createCourse(data: CreateCourseDto) {
    await this.ensureCourseSlugUnique(data.slug);

    if (data.imageUrl || data.imagePublicId) {
      await this.validateCourseImageFields(data.imageUrl, data.imagePublicId);
    }

    const hasProject = Boolean(data.hasProject);
    this.assertCourseProgressWeights({
      hasProject,
      topicWeight: data.topicWeight,
      projectWeight: data.projectWeight,
      requirePairWhenAnyProvided: true,
    });

    const topicWeight = hasProject ? 50 : 100;
    const projectWeight = hasProject ? 50 : 0;

    return this.prisma.course.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        imageUrl: data.imageUrl ?? null,
        imagePublicId: data.imagePublicId ?? null,
        hasProject,
        topicWeight: data.topicWeight ?? topicWeight,
        projectWeight: data.projectWeight ?? projectWeight,
      },
    });
  }

  async updateCourse(id: string, data: UpdateCourseDto) {
    await this.ensureCourseExists(id);

    if (data.slug) {
      await this.ensureCourseSlugUnique(data.slug, id);
    }

    if (data.imageUrl || data.imagePublicId) {
      await this.validateCourseImageFields(data.imageUrl, data.imagePublicId);
    }

    // Nếu có ảnh mới khác ảnh cũ thì xoá ảnh cũ trên Cloudinary
    if (data.imagePublicId) {
      const existing = await this.prisma.course.findUnique({
        where: { id },
        select: { imagePublicId: true },
      });

      if (existing?.imagePublicId && existing.imagePublicId !== data.imagePublicId) {
        await this.deleteCourseImage(existing.imagePublicId);
      }
    }

    const existingCourse = await this.prisma.course.findUnique({
      where: { id },
      select: { hasProject: true, topicWeight: true, projectWeight: true },
    });

    if (!existingCourse) {
      throw new NotFoundException(`Course with id '${id}' was not found`);
    }

    const hasProject =
      typeof data.hasProject === 'boolean'
        ? data.hasProject
        : existingCourse.hasProject;

    const providedAnyWeight =
      data.topicWeight !== undefined || data.projectWeight !== undefined;

    // Enabling project with no custom weights → defaults 50/50 (skip custom check).
    const usingDefaultsForNewProject =
      typeof data.hasProject === 'boolean' &&
      data.hasProject === true &&
      !existingCourse.hasProject &&
      !providedAnyWeight;

    // Disabling project with no custom weights → defaults 100/0 (skip custom check).
    const usingDefaultsForNoProject =
      typeof data.hasProject === 'boolean' &&
      data.hasProject === false &&
      !providedAnyWeight;

    if (!usingDefaultsForNewProject && !usingDefaultsForNoProject) {
      if (providedAnyWeight || typeof data.hasProject === 'boolean') {
        const resolvedTopic =
          data.topicWeight ??
          (typeof data.hasProject === 'boolean' && data.hasProject
            ? 50
            : typeof data.hasProject === 'boolean' && !data.hasProject
              ? 100
              : existingCourse.topicWeight);
        const resolvedProject =
          data.projectWeight ??
          (typeof data.hasProject === 'boolean' && data.hasProject
            ? 50
            : typeof data.hasProject === 'boolean' && !data.hasProject
              ? 0
              : existingCourse.projectWeight);

        this.assertCourseProgressWeights({
          hasProject,
          topicWeight: providedAnyWeight ? data.topicWeight : resolvedTopic,
          projectWeight: providedAnyWeight ? data.projectWeight : resolvedProject,
          requirePairWhenAnyProvided: providedAnyWeight,
        });
      }
    }

    const weightsChanged =
      (data.topicWeight !== undefined &&
        existingCourse.topicWeight !== data.topicWeight) ||
      (data.projectWeight !== undefined &&
        existingCourse.projectWeight !== data.projectWeight);

    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.imagePublicId !== undefined && { imagePublicId: data.imagePublicId }),
        ...(typeof data.hasProject === 'boolean'
          ? {
              hasProject: data.hasProject,
              topicWeight: data.topicWeight ?? (data.hasProject ? 50 : 100),
              projectWeight: data.projectWeight ?? (data.hasProject ? 50 : 0),
            }
          : {}),
        ...(data.topicWeight !== undefined &&
          typeof data.hasProject !== 'boolean' && { topicWeight: data.topicWeight }),
        ...(data.projectWeight !== undefined &&
          typeof data.hasProject !== 'boolean' && {
            projectWeight: data.projectWeight,
          }),
      },
    });

    const hasProjectToggled =
      typeof data.hasProject === 'boolean' &&
      existingCourse.hasProject !== data.hasProject;

    if (hasProjectToggled || weightsChanged) {
      await this.courseProgressService.reevaluateAllUsersForCourse(id);
    }

    return updated;
  }

  async deleteCourse(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { id: true, imagePublicId: true },
    });

    if (!course) {
      throw new NotFoundException(`Course with id '${id}' was not found`);
    }

    await this.prisma.course.delete({ where: { id } });

    if (course.imagePublicId) {
      await this.deleteCourseImage(course.imagePublicId);
    }

    return { id, deleted: true };
  }

  createImageUploadSignature(dto: CreateUploadSignatureDto) {
    const folder = (process.env.CLOUDINARY_COURSE_IMAGE_FOLDER ?? 'course-images').replace(
      /^\/+|\/+$/g,
      '',
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = dto.publicId?.trim()
      ? this.sanitizeCoursePublicId(dto.publicId)
      : undefined;

    return this.cloudinaryService.createUploadSignature({
      timestamp,
      folder,
      publicId,
      includeMaxBytes: true,
      ...this.cloudinaryService.getImageOptimizationDefaults(),
    });
  }

  async updateCourseTopics(courseId: string, data: UpdateCourseTopicsDto) {
    await this.ensureCourseExists(courseId);
    await this.ensureTopicsExist(data.topicIds);

    const uniqueTopicIds = [...new Set(data.topicIds)];

    await this.prisma.$transaction(async (tx) => {
      await tx.courseTopic.deleteMany({
        where: { courseId },
      });

      // Danh sách hiển thị theo sortOrder giảm dần, nên phần tử đầu mảng
      // nhận sortOrder cao nhất để giữ đúng thứ tự client gửi lên
      await tx.courseTopic.createMany({
        data: uniqueTopicIds.map((topicId, index) => ({
          courseId,
          topicId,
          sortOrder: uniqueTopicIds.length - index,
        })),
      });
    });

    await this.courseProgressService.reevaluateAllUsersForCourse(courseId);

    return this.getCourseById(courseId);
  }

  async createTopicForCourse(
    courseId: string,
    data: { name: string; slug: string },
  ) {
    await this.ensureCourseExists(courseId);
    await this.ensureTopicSlugUnique(data.slug);

    const topic = await this.prisma.$transaction(async (tx) => {
      const created = await tx.topic.create({
        data: {
          name: data.name,
          slug: data.slug,
        },
      });

      const lastLink = await tx.courseTopic.findFirst({
        where: { courseId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });

      await tx.courseTopic.create({
        data: {
          courseId,
          topicId: created.id,
          sortOrder: (lastLink?.sortOrder ?? 0) + 1,
        },
      });

      return created;
    });

    await this.courseProgressService.reevaluateAllUsersForCourse(courseId);

    return topic;
  }

  async getProjectRequirement(courseId: string) {
    await this.ensureCourseExists(courseId);

    const requirement = await this.prisma.courseProjectRequirement.findUnique({
      where: { courseId },
    });

    if (!requirement) {
      throw new NotFoundException(
        `Project requirement for course '${courseId}' was not found`,
      );
    }

    return requirement;
  }

  async upsertProjectRequirement(courseId: string, data: UpsertCourseProjectDto) {
    const course = await this.ensureCourseExists(courseId);
    const normalizedDescription = data.description.trim();

    if (!normalizedDescription) {
      throw new BadRequestException('Project description is required');
    }

    const existingRequirement =
      await this.prisma.courseProjectRequirement.findUnique({
        where: { courseId },
        select: {
          attachmentUrl: true,
          attachmentPublicId: true,
          attachmentOriginalName: true,
        },
      });

    const attachmentPatch = await this.resolveRequirementAttachmentPatch(
      courseId,
      data,
      existingRequirement,
    );

    const requirement = await this.prisma.courseProjectRequirement.upsert({
      where: { courseId },
      update: {
        title: data.title,
        description: normalizedDescription,
        isRequired: data.isRequired ?? true,
        ...attachmentPatch.data,
      },
      create: {
        courseId,
        title: data.title,
        description: normalizedDescription,
        isRequired: data.isRequired ?? true,
        attachmentUrl: attachmentPatch.data.attachmentUrl ?? null,
        attachmentPublicId: attachmentPatch.data.attachmentPublicId ?? null,
        attachmentOriginalName:
          attachmentPatch.data.attachmentOriginalName ?? null,
      },
    });

    if (attachmentPatch.publicIdToDelete) {
      await this.deleteCloudinaryFiles([attachmentPatch.publicIdToDelete]);
    }

    let enabledProject = false;
    if (!course.hasProject) {
      await this.prisma.course.update({
        where: { id: courseId },
        data: {
          hasProject: true,
          topicWeight: 50,
          projectWeight: 50,
        },
      });
      enabledProject = true;
    }

    if (enabledProject) {
      await this.courseProgressService.reevaluateAllUsersForCourse(courseId);
    }

    return requirement;
  }

  /**
   * Admin: signature to upload optional requirement brief/spec (pdf/docx/zip/rar).
   */
  async createProjectRequirementUploadSignature(
    courseId: string,
    dto: CreateUploadSignatureDto,
  ) {
    await this.ensureCourseExists(courseId);

    const folder = this.getProjectRequirementFolder(courseId);
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = dto.publicId?.trim()
      ? this.sanitizePublicId(dto.publicId)
      : undefined;

    return this.cloudinaryService.createUploadSignature({
      timestamp,
      folder,
      publicId,
    });
  }

  async createUploadSignature(
    courseId: string,
    req: ExpressRequest,
    dto: CreateUploadSignatureDto,
  ) {
    const userId = this.extractUserId(req);
    const course = await this.ensureCourseExists(courseId);

    if (!course.hasProject) {
      throw new BadRequestException('This course does not require a project');
    }

    const folder = this.getProjectSubmissionFolder(courseId, userId);
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = dto.publicId?.trim() ? this.sanitizePublicId(dto.publicId) : undefined;

    return this.cloudinaryService.createUploadSignature({
      timestamp,
      folder,
      publicId,
    });
  }

  async submitProject(
    courseId: string,
    req: ExpressRequest,
    data: CreateProjectSubmissionDto,
  ) {
    const userId = this.extractUserId(req);
    const course = await this.ensureCourseExists(courseId);

    if (!course.hasProject) {
      throw new BadRequestException('This course does not require a project');
    }

    const requirement = await this.prisma.courseProjectRequirement.findUnique({
      where: { courseId },
    });

    if (!requirement) {
      throw new BadRequestException('Project requirement is not configured for this course');
    }

    if (!requirement.description?.trim()) {
      throw new BadRequestException('Project requirement must include a description');
    }

    const existingSubmission = await this.prisma.projectSubmission.findFirst({
      where: {
        courseId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (existingSubmission) {
      throw new ConflictException(
        'You have already submitted this project. Please update the existing submission.',
      );
    }

    const uploadedCloudFiles = this.normalizeAndValidateSubmissionFiles(
      data.files,
      courseId,
      userId,
    );

    let submission: ProjectSubmissionWithFiles;

    try {
      submission = await this.prisma.projectSubmission.create({
        data: {
          userId,
          courseId,
          requirementId: requirement.id,
          note: data.note ?? null,
          status: ProjectSubmissionStatus.PENDING_REVIEW,
          files: {
            create: uploadedCloudFiles.map((file, index) => ({
              filePath: file.secureUrl,
              storageKey: file.publicId,
              originalName: file.originalName,
              mimeType: file.mimeType,
              fileSize: file.fileSize,
              sortOrder: index + 1,
            })),
          },
        },
        include: {
          files: true,
        },
      });
    } catch (error) {
      await this.deleteCloudinaryFiles(uploadedCloudFiles.map((file) => file.publicId));
      throw error;
    }

    await this.courseProgressService.evaluateCourseProgress(userId, courseId, req);

    return this.mapProjectSubmission(submission);
  }

  async getMySubmission(courseId: string, req: ExpressRequest) {
    const userId = this.extractUserId(req);
    await this.ensureCourseExists(courseId);

    const submission = await this.prisma.projectSubmission.findFirst({
      where: {
        courseId,
        userId,
      },
      orderBy: {
        submittedAt: 'desc',
      },
      include: {
        files: true,
      },
    });

    return submission ? this.mapProjectSubmission(submission) : null;
  }

  async updateProjectSubmission(
    courseId: string,
    submissionId: string,
    req: ExpressRequest,
    data: UpdateProjectSubmissionDto,
  ) {
    const userId = this.extractUserId(req);

    const submission = await this.prisma.projectSubmission.findFirst({
      where: {
        id: submissionId,
        courseId,
        userId,
      },
      include: {
        files: true,
      },
    });

    if (!submission) {
      throw new NotFoundException(`Submission with id '${submissionId}' was not found`);
    }

    if (
      submission.status !== ProjectSubmissionStatus.PENDING_REVIEW &&
      submission.status !== ProjectSubmissionStatus.REJECTED
    ) {
      throw new BadRequestException('Only pending or rejected submissions can be updated');
    }

    const uploadedFiles = data.files ?? [];
    const removeFilesProvided = Array.isArray(data.removeFiles);
    const removeTargets = this.normalizeRemoveTargets(data.removeFiles);

    const hasNewFiles = uploadedFiles.length > 0;
    // FE often sends only `files` when replacing the submission — treat as full replace.
    const replaceAllFiles = hasNewFiles && !removeFilesProvided;
    const hasFileUpdate =
      hasNewFiles || removeTargets.length > 0 || replaceAllFiles;
    const hasNoteUpdate = typeof data.note !== 'undefined';

    if (!hasFileUpdate && !hasNoteUpdate) {
      throw new BadRequestException('Provide files or note to update submission');
    }

    let filesToDelete = replaceAllFiles
      ? [...submission.files]
      : submission.files.filter((file) =>
          removeTargets.some((target) => this.fileMatchesRemoveTarget(file, target)),
        );

    if (!replaceAllFiles && removeTargets.length > 0) {
      const unresolvedTargets = removeTargets.filter(
        (target) =>
          !submission.files.some((file) => this.fileMatchesRemoveTarget(file, target)),
      );

      if (unresolvedTargets.length > 0) {
        throw new BadRequestException(
          `Some files could not be found in this submission: ${unresolvedTargets.join(', ')}`,
        );
      }
    }

    const deletedFileIds = new Set(filesToDelete.map((file) => file.id));

    const finalFileCount =
      submission.files.length - filesToDelete.length + uploadedFiles.length;

    if (finalFileCount === 0) {
      throw new BadRequestException('At least one file is required');
    }

    if (finalFileCount > MAX_PROJECT_FILES) {
      throw new BadRequestException(`A maximum of ${MAX_PROJECT_FILES} files is allowed`);
    }

    const nextNote = hasNoteUpdate ? data.note ?? null : submission.note;
    const updateInput: Prisma.ProjectSubmissionUpdateInput = {
      note: nextNote,
      // Reset to PENDING_REVIEW when resubmitting a rejected submission
      ...(submission.status === ProjectSubmissionStatus.REJECTED && {
        status: ProjectSubmissionStatus.PENDING_REVIEW,
        reviewerId: null,
        reviewerNote: null,
        reviewedAt: null,
      }),
    };

    const uploadedCloudFiles = hasNewFiles
      ? this.normalizeAndValidateSubmissionFiles(uploadedFiles, courseId, userId)
      : [];

    let updated: ProjectSubmissionWithFiles;

    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const updatedSubmission = await tx.projectSubmission.update({
          where: { id: submission.id },
          data: updateInput,
        });

        if (hasFileUpdate) {
          if (filesToDelete.length > 0) {
            await tx.projectSubmissionFile.deleteMany({
              where: {
                id: {
                  in: filesToDelete.map((file) => file.id),
                },
              },
            });
          }

          const keptFiles = submission.files
            .filter((file) => !deletedFileIds.has(file.id))
            .sort((a, b) => a.sortOrder - b.sortOrder);

          for (let index = 0; index < keptFiles.length; index += 1) {
            await tx.projectSubmissionFile.update({
              where: { id: keptFiles[index].id },
              data: { sortOrder: index + 1 },
            });
          }

          for (let index = 0; index < uploadedCloudFiles.length; index += 1) {
            const file = uploadedCloudFiles[index];
            await tx.projectSubmissionFile.create({
              data: {
                submissionId: submission.id,
                filePath: file.secureUrl,
                storageKey: file.publicId,
                originalName: file.originalName,
                mimeType: file.mimeType,
                fileSize: file.fileSize,
                sortOrder: keptFiles.length + index + 1,
              },
            });
          }
        }

        return tx.projectSubmission.findUniqueOrThrow({
          where: { id: updatedSubmission.id },
          include: {
            files: true,
          },
        });
      });
    } catch (error) {
      if (uploadedCloudFiles.length > 0) {
        await this.deleteCloudinaryFiles(uploadedCloudFiles.map((file) => file.publicId));
      }
      throw error;
    }

    if (filesToDelete.length > 0) {
      const oldStorageKeys = filesToDelete
        .map((file) => file.storageKey)
        .filter((key): key is string => Boolean(key));
      await this.deleteCloudinaryFiles(oldStorageKeys);
    }

    return this.mapProjectSubmission(updated);
  }

  async deleteProjectSubmission(
    courseId: string,
    submissionId: string,
    req: ExpressRequest,
  ) {
    const userId = this.extractUserId(req);

    const submission = await this.prisma.projectSubmission.findFirst({
      where: {
        id: submissionId,
        courseId,
        userId,
      },
      select: {
        id: true,
        status: true,
        files: {
          select: {
            storageKey: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException(`Submission with id '${submissionId}' was not found`);
    }

    if (
      submission.status !== ProjectSubmissionStatus.PENDING_REVIEW &&
      submission.status !== ProjectSubmissionStatus.REJECTED
    ) {
      throw new BadRequestException('Only pending or rejected submissions can be deleted');
    }

    await this.prisma.projectSubmission.delete({
      where: { id: submission.id },
    });

    const storageKeys = submission.files
      .map((file) => file.storageKey)
      .filter((key): key is string => Boolean(key));
    await this.deleteCloudinaryFiles(storageKeys);

    return {
      id: submission.id,
      deleted: true,
    };
  }

  async listProjectSubmissions(
    courseId: string,
    query: ListProjectSubmissionsQueryDto,
  ) {
    await this.ensureCourseExists(courseId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = {
      courseId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [submissions, total] = await Promise.all([
      this.prisma.projectSubmission.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          submittedAt: 'desc',
        },
        include: {
          files: true,
        },
      }),
      this.prisma.projectSubmission.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items: submissions.map((submission) => this.mapProjectSubmission(submission)),
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

  async reviewProjectSubmission(
    courseId: string,
    submissionId: string,
    dto: ReviewProjectSubmissionDto,
    req: ExpressRequest,
  ) {
    const reviewerId = this.extractUserId(req);

    const submission = await this.prisma.projectSubmission.findFirst({
      where: {
        id: submissionId,
        courseId,
      },
    });

    if (!submission) {
      throw new NotFoundException(`Submission with id '${submissionId}' was not found`);
    }

    const nextStatus =
      dto.decision === ReviewDecision.APPROVE
        ? ProjectSubmissionStatus.APPROVED
        : ProjectSubmissionStatus.REJECTED;

    const updated = await this.prisma.projectSubmission.update({
      where: {
        id: submission.id,
      },
      data: {
        status: nextStatus,
        reviewerId,
        reviewerNote: dto.reviewerNote,
        reviewedAt: new Date(),
      },
      include: {
        files: true,
      },
    });

    // Metadata sync to /users/me requires user context, so reevaluation here skips remote sync.
    await this.courseProgressService.evaluateCourseProgress(submission.userId, courseId);

    return this.mapProjectSubmission(updated);
  }

  async getMyCoursesProgress(query: MyCourseProgressQueryDto, req: ExpressRequest) {
    const userId = this.extractUserId(req);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserCourseProgressWhereInput = {
      userId,
      ...this.buildMyCourseProgressStatusFilter(query),
    };

    // Default: read stored progress only (fast). Optional ?revalidate=true heals the page.
    // Admin curriculum writes already fan-out reevaluation on the write path.
    if (query.revalidate) {
      const pageRows = await this.prisma.userCourseProgress.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: { courseId: true },
      });

      await this.courseProgressService.evaluateCourseProgressBatch(
        userId,
        pageRows.map((row) => row.courseId),
      );
    }

    type ProgressListRow = {
      id: string;
      userId: string;
      courseId: string;
      topicProgressPercent: number;
      projectProgressPercent: number;
      progressPercent: number;
      status: CourseProgressStatus;
      topicsCompletedAt: Date | null;
      projectApprovedAt: Date | null;
      completedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      course_id: string;
      course_name: string;
      course_slug: string;
      course_description: string | null;
      course_image_url: string | null;
      course_has_project: boolean;
      course_topic_weight: number;
      course_project_weight: number;
      topic_count: number;
      req_id: string | null;
      req_title: string | null;
      req_is_required: boolean | null;
      total_count: number;
    };

    const scopeStatuses =
      query.status
        ? [query.status]
        : query.scope === MyCourseProgressScope.COMPLETED
          ? [CourseProgressStatus.COMPLETED]
          : query.scope === MyCourseProgressScope.ACTIVE
            ? [
                CourseProgressStatus.IN_PROGRESS,
                CourseProgressStatus.TOPICS_COMPLETED,
                CourseProgressStatus.PROJECT_PENDING_APPROVAL,
              ]
            : null;

    const statusClause = scopeStatuses
      ? Prisma.sql`AND p.status::text IN (${Prisma.join(scopeStatuses)})`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<ProgressListRow[]>`
      SELECT
        p.id,
        p."userId",
        p."courseId",
        p."topicProgressPercent",
        p."projectProgressPercent",
        p."progressPercent",
        p.status,
        p."topicsCompletedAt",
        p."projectApprovedAt",
        p."completedAt",
        p."createdAt",
        p."updatedAt",
        c.id AS course_id,
        c.name AS course_name,
        c.slug AS course_slug,
        c.description AS course_description,
        c."imageUrl" AS course_image_url,
        c."hasProject" AS course_has_project,
        c."topicWeight" AS course_topic_weight,
        c."projectWeight" AS course_project_weight,
        (SELECT COUNT(*)::int FROM course_topics ct WHERE ct."courseId" = c.id) AS topic_count,
        pr.id AS req_id,
        pr.title AS req_title,
        pr."isRequired" AS req_is_required,
        COUNT(*) OVER()::int AS total_count
      FROM user_course_progresses p
      INNER JOIN courses c ON c.id = p."courseId"
      LEFT JOIN course_project_requirements pr ON pr."courseId" = c.id
      WHERE p."userId" = ${userId}
      ${statusClause}
      ORDER BY p."updatedAt" DESC, p."createdAt" DESC
      LIMIT ${limit} OFFSET ${skip}
    `;

    const total = rows[0]?.total_count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        courseId: row.courseId,
        topicProgressPercent: row.topicProgressPercent,
        projectProgressPercent: row.projectProgressPercent,
        progressPercent: row.progressPercent,
        status: row.status,
        topicsCompletedAt: row.topicsCompletedAt,
        projectApprovedAt: row.projectApprovedAt,
        completedAt: row.completedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        course: {
          id: row.course_id,
          name: row.course_name,
          slug: row.course_slug,
          description: row.course_description,
          imageUrl: row.course_image_url,
          hasProject: row.course_has_project,
          topicWeight: row.course_topic_weight,
          projectWeight: row.course_project_weight,
          topicCount: row.topic_count,
          projectRequirement: row.req_id
            ? {
                id: row.req_id,
                title: row.req_title,
                isRequired: row.req_is_required,
              }
            : null,
        },
      })),
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

  async getMyCourseProgress(courseId: string, req: ExpressRequest) {
    const userId = this.extractUserId(req);
    await this.ensureCourseExists(courseId);

    // Heal locally without blocking on Profiles HTTP (metadata sync stays on write paths).
    const [progress, latestSubmission] = await Promise.all([
      this.courseProgressService.evaluateCourseProgress(userId, courseId),
      this.prisma.projectSubmission.findFirst({
        where: {
          userId,
          courseId,
        },
        orderBy: {
          submittedAt: 'desc',
        },
        include: {
          files: true,
        },
      }),
    ]);

    return {
      progress,
      latestSubmission: latestSubmission
        ? this.mapProjectSubmission(latestSubmission)
        : null,
    };
  }

  private buildMyCourseProgressStatusFilter(
    query: MyCourseProgressQueryDto,
  ): Prisma.UserCourseProgressWhereInput {
    if (query.status) {
      return { status: query.status };
    }

    if (query.scope === MyCourseProgressScope.COMPLETED) {
      return { status: CourseProgressStatus.COMPLETED };
    }

    if (query.scope === MyCourseProgressScope.ACTIVE) {
      return {
        status: {
          in: [
            CourseProgressStatus.IN_PROGRESS,
            CourseProgressStatus.TOPICS_COMPLETED,
            CourseProgressStatus.PROJECT_PENDING_APPROVAL,
          ],
        },
      };
    }

    return {};
  }

  private mapProjectSubmission(submission: ProjectSubmissionWithFiles) {
    const files = [...submission.files]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((file) => ({
        id: file.id,
        secureUrl: file.filePath,
        publicId: file.storageKey,
        originalName: file.originalName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        sortOrder: file.sortOrder,
      }));

    const { files: _files, ...rest } = submission;

    return {
      ...rest,
      files,
    };
  }

  private getProjectSubmissionFolder(courseId: string, userId: string): string {
    const baseFolder = (process.env.CLOUDINARY_PROJECT_FOLDER ?? 'project-submissions')
      .replace(/^\/+|\/+$/g, '');

    return `${baseFolder}/${courseId}/${userId}`;
  }

  private getProjectRequirementFolder(courseId: string): string {
    const baseFolder = (
      process.env.CLOUDINARY_PROJECT_REQUIREMENT_FOLDER ?? 'project-requirements'
    ).replace(/^\/+|\/+$/g, '');

    return `${baseFolder}/${courseId}`;
  }

  /**
   * Resolve optional attachment fields for requirement upsert.
   * - omit both url/publicId → keep existing
   * - both null → clear
   * - both set → validate + replace (delete old after save)
   */
  private async resolveRequirementAttachmentPatch(
    courseId: string,
    data: UpsertCourseProjectDto,
    existing: {
      attachmentUrl: string | null;
      attachmentPublicId: string | null;
      attachmentOriginalName: string | null;
    } | null,
  ): Promise<{
    data: {
      attachmentUrl?: string | null;
      attachmentPublicId?: string | null;
      attachmentOriginalName?: string | null;
    };
    publicIdToDelete?: string;
  }> {
    const urlProvided = data.attachmentUrl !== undefined;
    const publicIdProvided = data.attachmentPublicId !== undefined;

    if (!urlProvided && !publicIdProvided) {
      return { data: {} };
    }

    if (urlProvided !== publicIdProvided) {
      throw new BadRequestException(
        'attachmentUrl and attachmentPublicId must be provided together (or both null to remove)',
      );
    }

    // Clear attachment
    if (data.attachmentUrl === null && data.attachmentPublicId === null) {
      return {
        data: {
          attachmentUrl: null,
          attachmentPublicId: null,
          attachmentOriginalName: null,
        },
        publicIdToDelete: existing?.attachmentPublicId ?? undefined,
      };
    }

    const attachmentUrl = String(data.attachmentUrl).trim();
    const attachmentPublicId = this.sanitizePublicId(
      String(data.attachmentPublicId),
    );
    const attachmentOriginalName = (
      data.attachmentOriginalName ??
      existing?.attachmentOriginalName ??
      'requirement'
    ).trim();

    if (!attachmentOriginalName) {
      throw new BadRequestException('attachmentOriginalName is required');
    }

    const extension = extname(attachmentOriginalName).toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
      throw new BadRequestException(
        'Requirement attachment must be zip, rar, pdf, or docx',
      );
    }

    this.assertRequirementAttachmentUrl(
      attachmentUrl,
      attachmentPublicId,
      courseId,
    );

    const publicIdToDelete =
      existing?.attachmentPublicId &&
      existing.attachmentPublicId !== attachmentPublicId
        ? existing.attachmentPublicId
        : undefined;

    return {
      data: {
        attachmentUrl,
        attachmentPublicId,
        attachmentOriginalName,
      },
      publicIdToDelete,
    };
  }

  private assertRequirementAttachmentUrl(
    secureUrl: string,
    publicId: string,
    courseId: string,
  ): void {
    const folder = this.getProjectRequirementFolder(courseId);
    const { cloudName } = this.cloudinaryService.getCloudinaryConfig();

    let parsed: URL;
    try {
      parsed = new URL(secureUrl);
    } catch {
      throw new BadRequestException(`Invalid attachmentUrl: ${secureUrl}`);
    }

    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname.endsWith('res.cloudinary.com')
    ) {
      throw new BadRequestException(
        'attachmentUrl must be a valid Cloudinary https URL',
      );
    }

    if (!parsed.pathname.includes(`/${cloudName}/`)) {
      throw new BadRequestException(
        'attachmentUrl does not belong to configured Cloudinary cloud',
      );
    }

    if (!publicId.startsWith(`${folder}/`) && publicId !== folder) {
      throw new BadRequestException(
        'attachmentPublicId does not belong to the expected project-requirement folder',
      );
    }
  }

  private sanitizePublicId(input: string): string {
    const trimmed = input.trim();
    const sanitized = trimmed.replace(/[^a-zA-Z0-9/_-]/g, '_').replace(/^\/+|\/+$/g, '');

    if (!sanitized) {
      throw new BadRequestException('publicId is invalid');
    }

    return sanitized;
  }

  private normalizeAndValidateSubmissionFiles(
    files: ProjectSubmissionFileMetadataDto[],
    courseId: string,
    userId: string,
  ): ValidatedProjectFileMetadata[] {
    if (files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }

    if (files.length > MAX_PROJECT_FILES) {
      throw new BadRequestException(`A maximum of ${MAX_PROJECT_FILES} files is allowed`);
    }

    const folder = this.getProjectSubmissionFolder(courseId, userId);
    const { cloudName } = this.cloudinaryService.getCloudinaryConfig();
    const seenSecureUrls = new Set<string>();
    const seenPublicIds = new Set<string>();

    return files.map((file) => {
      const secureUrl = file.secureUrl.trim();
      const publicId = this.sanitizePublicId(file.publicId);
      const originalName = file.originalName.trim();
      const mimeType = file.mimeType.trim();
      const fileSize = file.fileSize;

      if (!originalName) {
        throw new BadRequestException('originalName is required');
      }

      const extension = extname(originalName).toLowerCase();
      if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
        throw new BadRequestException('Only zip, rar, pdf, docx files are allowed');
      }

      if (!mimeType) {
        throw new BadRequestException('mimeType is required');
      }

      if (fileSize < 1 || fileSize > MAX_PROJECT_FILE_SIZE) {
        throw new BadRequestException('File size must be between 1 byte and 20MB');
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(secureUrl);
      } catch {
        throw new BadRequestException(`Invalid secureUrl: ${secureUrl}`);
      }

      if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname.endsWith('res.cloudinary.com')) {
        throw new BadRequestException('secureUrl must be a valid Cloudinary https URL');
      }

      if (!parsedUrl.pathname.includes(`/${cloudName}/`)) {
        throw new BadRequestException('secureUrl does not belong to configured Cloudinary cloud');
      }

      if (!publicId.startsWith(`${folder}/`)) {
        throw new BadRequestException('publicId does not belong to the expected course upload folder');
      }

      if (seenSecureUrls.has(secureUrl)) {
        throw new BadRequestException('Duplicate secureUrl detected in files payload');
      }

      if (seenPublicIds.has(publicId)) {
        throw new BadRequestException('Duplicate publicId detected in files payload');
      }

      seenSecureUrls.add(secureUrl);
      seenPublicIds.add(publicId);

      return {
        secureUrl,
        publicId,
        originalName,
        mimeType,
        fileSize,
      };
    });
  }

  private async deleteCloudinaryFiles(storageKeys: string[]): Promise<void> {
    await Promise.all(
      storageKeys.map(async (key) => {
        try {
          await this.cloudinaryService.deleteRawFile(key);
        } catch (error) {
          this.logger.warn(`Failed to delete Cloudinary asset '${key}'`);
        }
      }),
    );
  }

  private withCourseTopicAvailability<
    T extends {
      topics: Array<{ topic: { startsAt: Date | null; endsAt: Date | null } }>;
    },
  >(course: T) {
    return {
      ...course,
      topics: course.topics.map((link) => ({
        ...link,
        topic: withTopicAvailability(link.topic),
      })),
    };
  }

  private async ensureCourseExists(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException(`Course with id '${courseId}' was not found`);
    }

    return course;
  }

  private async ensureCourseSlugUnique(slug: string, currentCourseId?: string) {
    const existing = await this.prisma.course.findFirst({
      where: {
        slug,
        ...(currentCourseId ? { id: { not: currentCourseId } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new ConflictException(`Course slug '${slug}' already exists`);
    }
  }

  private async ensureTopicsExist(topicIds: string[]) {
    const uniqueIds = [...new Set(topicIds)];

    const count = await this.prisma.topic.count({
      where: {
        id: {
          in: uniqueIds,
        },
      },
    });

    if (count !== uniqueIds.length) {
      throw new NotFoundException('Some topic ids do not exist');
    }
  }

  private async ensureTopicSlugUnique(slug: string) {
    const existing = await this.prisma.topic.findFirst({
      where: { slug },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(`Topic slug '${slug}' already exists`);
    }
  }

  private extractUserId(req: ExpressRequest): string {
    const user = (req as ExpressRequest & { user?: any }).user;

    const candidates = [
      user?.id,
      user?.sub,
      user?.user?.id,
      user?.data?.id,
      user?.data?.user?.id,
    ];

    const userId = candidates.find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    );

    if (!userId) {
      throw new ForbiddenException('Unable to resolve authenticated user id');
    }

    return userId;
  }

  private normalizeRemoveTargets(rawTargets?: string[]): string[] {
    if (!rawTargets) {
      return [];
    }

    return [...new Set(rawTargets.map((item) => item.trim()).filter((item) => item.length > 0))];
  }

  /** Match removeFiles entry against id, secureUrl, publicId, or Cloudinary path variants. */
  private fileMatchesRemoveTarget(
    file: { id: string; filePath: string; storageKey: string | null },
    target: string,
  ): boolean {
    const normalizedTarget = this.normalizeCloudinaryRef(target);
    if (!normalizedTarget) {
      return false;
    }

    if (
      file.id === target.trim() ||
      this.normalizeCloudinaryRef(file.filePath) === normalizedTarget ||
      (file.storageKey
        ? this.normalizeCloudinaryRef(file.storageKey) === normalizedTarget
        : false)
    ) {
      return true;
    }

    if (file.storageKey) {
      const key = this.normalizeCloudinaryRef(file.storageKey);
      if (key && normalizedTarget.includes(key)) {
        return true;
      }
    }

    return false;
  }

  private normalizeCloudinaryRef(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const url = new URL(trimmed);
      // /<cloud>/raw/upload/v123/folder/file -> folder/file
      const parts = url.pathname.split('/').filter(Boolean);
      const uploadIdx = parts.findIndex((part) => part === 'upload');
      if (uploadIdx >= 0) {
        const afterUpload = parts.slice(uploadIdx + 1);
        const withoutVersion =
          afterUpload[0] && /^v\d+$/.test(afterUpload[0])
            ? afterUpload.slice(1)
            : afterUpload;
        return decodeURIComponent(withoutVersion.join('/'));
      }
      return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    } catch {
      return decodeURIComponent(trimmed.replace(/^\/+/, ''));
    }
  }

  private assertCourseProgressWeights(params: {
    hasProject: boolean;
    topicWeight?: number;
    projectWeight?: number;
    requirePairWhenAnyProvided?: boolean;
  }): void {
    const {
      hasProject,
      topicWeight,
      projectWeight,
      requirePairWhenAnyProvided = false,
    } = params;

    const hasTopicWeight = topicWeight !== undefined;
    const hasProjectWeight = projectWeight !== undefined;

    if (requirePairWhenAnyProvided && hasTopicWeight !== hasProjectWeight) {
      throw new BadRequestException(
        'Both topicWeight and projectWeight are required when setting progress weights',
      );
    }

    if (!hasTopicWeight || !hasProjectWeight) {
      return;
    }

    if (!hasProject) {
      if (topicWeight !== 100 || projectWeight !== 0) {
        throw new BadRequestException(
          'Courses without a project must use topicWeight=100 and projectWeight=0',
        );
      }
      return;
    }

    const sum = topicWeight + projectWeight;
    if (sum !== 100) {
      throw new BadRequestException(
        `topicWeight + projectWeight must equal 100 (got ${sum})`,
      );
    }
  }

  private async validateCourseImageFields(
    imageUrl?: string,
    imagePublicId?: string,
  ): Promise<void> {
    if ((imageUrl && !imagePublicId) || (!imageUrl && imagePublicId)) {
      throw new BadRequestException('imageUrl and imagePublicId must be provided together');
    }

    if (imageUrl) {
      const { cloudName } = this.cloudinaryService.getCloudinaryConfig();
      let parsed: URL;
      try {
        parsed = new URL(imageUrl);
      } catch {
        throw new BadRequestException('imageUrl is not a valid URL');
      }

      if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('res.cloudinary.com')) {
        throw new BadRequestException('imageUrl must be a valid Cloudinary https URL');
      }

      if (!parsed.pathname.includes(`/${cloudName}/`)) {
        throw new BadRequestException('imageUrl does not belong to the configured Cloudinary cloud');
      }
    }

    if (imagePublicId) {
      await this.cloudinaryService.assertImageWithinMaxBytes(imagePublicId);
    }
  }

  private sanitizeCoursePublicId(input: string): string {
    const trimmed = input.trim();
    const sanitized = trimmed.replace(/[^a-zA-Z0-9/_-]/g, '_').replace(/^\/+|\/+$/g, '');

    if (!sanitized) {
      throw new BadRequestException('publicId is invalid');
    }

    return sanitized;
  }

  private async deleteCourseImage(publicId: string): Promise<void> {
    try {
      await this.cloudinaryService.deleteRawFile(publicId);
    } catch {
      this.logger.warn(`Failed to delete Cloudinary course image '${publicId}'`);
    }
  }
}
