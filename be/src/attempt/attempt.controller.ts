import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { AttemptService } from './attempt.service';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { AttemptQueryDto } from './dto/attempt-query.dto';
import { SessionHistoryQueryDto } from './dto/session-history-query.dto';
import { StartSessionDto } from './dto/start-session.dto';
import { SaveSessionDto } from './dto/save-session.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  CONTENT_READ,
  CONTENT_WRITE,
  RESULT_READ,
} from '../auth/quiz-permissions';

@Controller()
export class AttemptController {
  constructor(private readonly attemptService: AttemptService) {}

  @Permissions(...CONTENT_READ)
  @Post('topic/:topicId/session/start')
  @HttpCode(HttpStatus.OK)
  async startTopicSession(
    @Param('topicId') topicId: string,
    @Body() dto: StartSessionDto,
    @Request() req: ExpressRequest,
  ) {
    return this.attemptService.startTopicSession(topicId, dto, req);
  }

  @Permissions(...CONTENT_READ)
  @Get('topic/:topicId/session/resume')
  async resumeTopicSession(
    @Param('topicId') topicId: string,
    @Request() req: ExpressRequest,
  ) {
    return this.attemptService.resumeTopicSession(topicId, req);
  }

  @Permissions(...CONTENT_READ)
  @Post('attempt/session/:sessionId/save')
  @HttpCode(HttpStatus.OK)
  async saveSessionProgress(
    @Param('sessionId') sessionId: string,
    @Body() dto: SaveSessionDto,
    @Request() req: ExpressRequest,
  ) {
    return this.attemptService.saveSessionProgress(sessionId, dto, req);
  }

  @Permissions(...CONTENT_READ)
  @Post('attempt/session/:sessionId/submit')
  @HttpCode(HttpStatus.OK)
  async submitSession(
    @Param('sessionId') sessionId: string,
    @Request() req: ExpressRequest,
  ) {
    return this.attemptService.submitSession(sessionId, req);
  }

  @Permissions(...CONTENT_READ)
  @Post('attempt/session/:sessionId/abandon')
  @HttpCode(HttpStatus.OK)
  async abandonSession(
    @Param('sessionId') sessionId: string,
    @Request() req: ExpressRequest,
  ) {
    return this.attemptService.abandonSession(sessionId, req);
  }

  @Post('quiz/:id/attempt')
  @Permissions(...CONTENT_WRITE)
  @HttpCode(HttpStatus.OK)
  async submitAttempt(
    @Param('id') id: string,
    @Body() dto: SubmitAttemptDto,
    @Request() req: ExpressRequest,
  ) {
    return this.attemptService.submitAttempt(id, dto, req);
  }

  @Permissions(...RESULT_READ)
  @Get('attempt/sessions/me')
  async getMySessions(
    @Query() query: SessionHistoryQueryDto,
    @Request() req: ExpressRequest,
  ) {
    return this.attemptService.getMySessions(query, req);
  }

  @Permissions(...RESULT_READ)
  @Get('attempt/sessions/me/:sessionId')
  async getMySessionById(
    @Param('sessionId') sessionId: string,
    @Request() req: ExpressRequest,
  ) {
    return this.attemptService.getMySessionById(sessionId, req);
  }

  @Permissions(...RESULT_READ)
  @Get('attempt/me')
  async getMyAttempts(
    @Query() query: AttemptQueryDto,
    @Request() req: ExpressRequest,
  ) {
    return this.attemptService.getMyAttempts(query, req);
  }

  @Permissions(...RESULT_READ)
  @Get('attempt/me/:attemptId')
  async getMyAttemptById(
    @Param('attemptId') attemptId: string,
    @Request() req: ExpressRequest,
  ) {
    return this.attemptService.getMyAttemptById(attemptId, req);
  }

  @Permissions(...CONTENT_READ)
  @Get('progress/me')
  async getMyProgress(@Request() req: ExpressRequest) {
    return this.attemptService.getMyProgress(req);
  }

  @Permissions(...CONTENT_READ)
  @Get('progress/me/topic/:topicId')
  async getMyTopicProgress(
    @Param('topicId') topicId: string,
    @Request() req: ExpressRequest,
  ) {
    return this.attemptService.getMyTopicProgress(topicId, req);
  }
}
