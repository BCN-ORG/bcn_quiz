import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { TopicService } from './topic.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { CreateUploadSignatureDto } from './dto/create-upload-signature.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  CONTENT_CREATE,
  CONTENT_DELETE,
  CONTENT_READ,
  CONTENT_UPDATE,
  CONTENT_WRITE,
} from '../auth/quiz-permissions';
import {
  TopicSlugQueryDto,
  TopicSlugScopeDto,
} from './dto/topic-slug-query.dto';

@Controller('topic')
export class TopicController {
  constructor(private readonly topicService: TopicService) {}

  @Permissions(...CONTENT_READ)
  @Get()
  async getAllTopics(@Query() query: PaginationQueryDto) {
    return this.topicService.getAllTopics(query);
  }

  /** Static `slug` segment before `:id` so `/topic/slug/...` is not captured as an id. */
  @Permissions(...CONTENT_READ)
  @Get('slug/:slug/quizzes')
  async getQuizzesByTopicSlug(
    @Param('slug') slug: string,
    @Query() query: TopicSlugQueryDto,
  ) {
    return this.topicService.getQuizzesByTopicSlug(slug, query, query.courseId);
  }

  @Permissions(...CONTENT_READ)
  @Get('slug/:slug')
  async getTopicBySlug(
    @Param('slug') slug: string,
    @Query() query: TopicSlugScopeDto,
  ) {
    return this.topicService.getTopicBySlug(slug, query.courseId);
  }

  // Admin/mentor editor: includes answer/explanation
  @Permissions(...CONTENT_UPDATE)
  @Get(':id/quizzes/full')
  async getQuizzesWithAnswersByTopicId(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.topicService.getQuizzesWithAnswersByTopicId(id, query);
  }

  @Permissions(...CONTENT_READ)
  @Get(':id/quizzes')
  async getQuizzesByTopicId(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.topicService.getQuizzesByTopicId(id, query);
  }

  @Permissions(...CONTENT_READ)
  @Get(':id')
  async getTopicById(@Param('id') id: string) {
    return this.topicService.getTopicById(id);
  }

  @Permissions(...CONTENT_WRITE)
  @Post('upload/signature')
  createUploadSignature(@Body() dto: CreateUploadSignatureDto) {
    return this.topicService.createUploadSignature(dto);
  }

  @Permissions(...CONTENT_CREATE)
  @Post()
  async createTopic(@Body() data: CreateTopicDto) {
    return this.topicService.createTopic(data);
  }

  @Permissions(...CONTENT_UPDATE)
  @Put(':id')
  async updateTopic(@Param('id') id: string, @Body() data: UpdateTopicDto) {
    return this.topicService.updateTopic(id, data);
  }

  @Permissions(...CONTENT_DELETE)
  @Delete(':id')
  async deleteTopic(@Param('id') id: string) {
    return this.topicService.deleteTopic(id);
  }
}
