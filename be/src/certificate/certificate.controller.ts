import { Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CertificateRequestService } from './certificate-request.service';
import { CertificateService } from './certificate.service';
import { CertificateQueryDto } from './dto/certificate-query.dto';

@Controller('certificate')
export class CertificateController {
  constructor(
    private readonly certificateService: CertificateService,
    private readonly requests: CertificateRequestService,
  ) {}

  @Get('me')
  async getMyCertificates(
    @Query() query: CertificateQueryDto,
    @Request() req: ExpressRequest,
  ) {
    return this.certificateService.getMyCertificates(query, req);
  }

  /** The caller's own certificate requests and where each one stands. */
  @Get('requests/me')
  async myRequests(@Request() req: ExpressRequest) {
    return this.requests.listMine(req);
  }

  /** After a rejection, once the course is completed again. Only ever acts on the caller's own request. */
  @Post('requests/:courseId/resubmit')
  async resubmit(
    @Param('courseId') courseId: string,
    @Request() req: ExpressRequest,
  ) {
    return this.requests.resubmit(courseId, req);
  }

  /** Public suggest — no auth required. */
  @Public()
  @Get('suggest')
  async suggest(@Query('q') q = '') {
    return this.certificateService.suggest(q);
  }

  /** Public verify — no auth required. */
  @Public()
  @Get('verify/:code')
  async verifyByCode(@Param('code') code: string) {
    return this.certificateService.verifyByCode(code);
  }
}
