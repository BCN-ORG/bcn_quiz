import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CONTENT_DELETE, CONTENT_WRITE } from '../auth/quiz-permissions';
import { CourseService } from './course.service';
import { CreateProjectSubmissionDto } from './dto/create-project-submission.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateUploadSignatureDto } from './dto/create-upload-signature.dto';
import { ListProjectSubmissionsQueryDto } from './dto/list-project-submissions-query.dto';
import { MyCourseProgressQueryDto } from './dto/my-course-progress-query.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { ReviewProjectSubmissionDto } from './dto/review-project-submission.dto';
import { UpdateProjectSubmissionDto } from './dto/update-project-submission.dto';
import { UpdateCourseTopicsDto } from './dto/update-course-topics.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UpsertCourseProjectDto } from './dto/upsert-course-project.dto';

@Controller('course')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Get()
  async getAllCourses(@Query() query: PaginationQueryDto) {
    return this.courseService.getAllCourses(query);
  }

  @Get('slug/:slug')
  async getCourseBySlug(@Param('slug') slug: string) {
    return this.courseService.getCourseBySlug(slug);
  }

  /** Must be registered before `:id` routes so `progress` is not treated as an id. */
  @Get('progress/me')
  async getMyCoursesProgress(
    @Query() query: MyCourseProgressQueryDto,
    @Request() req: ExpressRequest,
  ) {
    return this.courseService.getMyCoursesProgress(query, req);
  }

  @Get(':id/topics')
  async getCourseTopics(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.courseService.getCourseTopics(id, query);
  }

  @Get(':id')
  async getCourseById(@Param('id') id: string) {
    return this.courseService.getCourseById(id);
  }

  @Get(':id/progress/me')
  async getMyCourseProgress(
    @Param('id') id: string,
    @Request() req: ExpressRequest,
  ) {
    return this.courseService.getMyCourseProgress(id, req);
  }

  @Get(':id/project-submission/me')
  async getMySubmission(
    @Param('id') id: string,
    @Request() req: ExpressRequest,
  ) {
    return this.courseService.getMySubmission(id, req);
  }

  @Permissions(...CONTENT_WRITE)
  @Get(':id/project-submission')
  @Header('Cache-Control', 'no-store')
  async listProjectSubmissions(
    @Param('id') id: string,
    @Query() query: ListProjectSubmissionsQueryDto,
  ) {
    return this.courseService.listProjectSubmissions(id, query);
  }

  @Permissions(...CONTENT_WRITE)
  @Post('upload/image-signature')
  createImageUploadSignature(@Body() dto: CreateUploadSignatureDto) {
    return this.courseService.createImageUploadSignature(dto);
  }

  @Permissions(...CONTENT_WRITE)
  @Post()
  async createCourse(@Body() data: CreateCourseDto) {
    return this.courseService.createCourse(data);
  }

  @Permissions(...CONTENT_WRITE)
  @Put(':id')
  async updateCourse(@Param('id') id: string, @Body() data: UpdateCourseDto) {
    return this.courseService.updateCourse(id, data);
  }

  @Permissions(...CONTENT_DELETE)
  @Delete(':id')
  async deleteCourse(@Param('id') id: string) {
    return this.courseService.deleteCourse(id);
  }

  @Permissions(...CONTENT_WRITE)
  @Put(':id/topics')
  async updateCourseTopics(
    @Param('id') id: string,
    @Body() data: UpdateCourseTopicsDto,
  ) {
    return this.courseService.updateCourseTopics(id, data);
  }

  @Get(':id/project-requirement')
  async getProjectRequirement(@Param('id') id: string) {
    return this.courseService.getProjectRequirement(id);
  }

  @Permissions(...CONTENT_WRITE)
  @Post(':id/project-requirement/upload/signature')
  async createProjectRequirementUploadSignature(
    @Param('id') id: string,
    @Body() data: CreateUploadSignatureDto,
  ) {
    return this.courseService.createProjectRequirementUploadSignature(id, data);
  }

  @Permissions(...CONTENT_WRITE)
  @Put(':id/project-requirement')
  async upsertProjectRequirement(
    @Param('id') id: string,
    @Body() data: UpsertCourseProjectDto,
  ) {
    return this.courseService.upsertProjectRequirement(id, data);
  }

  @Post(':id/upload/signature')
  async createUploadSignature(
    @Param('id') id: string,
    @Body() data: CreateUploadSignatureDto,
    @Request() req: ExpressRequest,
  ) {
    return this.courseService.createUploadSignature(id, req, data);
  }

  @Post(':id/project-submission')
  async submitProject(
    @Param('id') id: string,
    @Body() data: CreateProjectSubmissionDto,
    @Request() req: ExpressRequest,
  ) {
    return this.courseService.submitProject(id, req, data);
  }

  @Patch(':id/project-submission/:submissionId')
  async updateProjectSubmission(
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @Body() data: UpdateProjectSubmissionDto,
    @Request() req: ExpressRequest,
  ) {
    return this.courseService.updateProjectSubmission(
      id,
      submissionId,
      req,
      data,
    );
  }

  @Delete(':id/project-submission/:submissionId')
  async deleteProjectSubmission(
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @Request() req: ExpressRequest,
  ) {
    return this.courseService.deleteProjectSubmission(id, submissionId, req);
  }

  @Permissions(...CONTENT_WRITE)
  @Patch(':id/project-submission/:submissionId/review')
  async reviewProjectSubmission(
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @Body() data: ReviewProjectSubmissionDto,
    @Request() req: ExpressRequest,
  ) {
    return this.courseService.reviewProjectSubmission(
      id,
      submissionId,
      data,
      req,
    );
  }
}
