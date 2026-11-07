import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CONTENT_UPDATE } from '../auth/quiz-permissions';
import { CertificateRequestService } from './certificate-request.service';
import {
  BulkApproveCertificateRequestsDto,
  ListCertificateRequestsQueryDto,
  ReviewCertificateRequestDto,
  RevokeCertificateDto,
} from './dto/certificate-request.dto';

/** Admin review of certificate requests. The learner id always comes from the stored request, never from the client. */
@Controller('admin/certificate-requests')
export class CertificateAdminController {
  constructor(private readonly requests: CertificateRequestService) {}

  @Permissions(...CONTENT_UPDATE)
  @Get()
  list(@Query() query: ListCertificateRequestsQueryDto) {
    return this.requests.adminList(query);
  }

  /** Approve the ticked requests; answers which were approved and which were skipped (with the reason). */
  @Permissions(...CONTENT_UPDATE)
  @Post('bulk-approve')
  bulkApprove(
    @Body() dto: BulkApproveCertificateRequestsDto,
    @Request() req: ExpressRequest,
  ) {
    return this.requests.bulkApprove(dto, req);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.requests.adminDetail(id);
  }

  @Permissions(...CONTENT_UPDATE)
  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Body() dto: ReviewCertificateRequestDto,
    @Request() req: ExpressRequest,
  ) {
    return this.requests.review(id, dto, req);
  }

  @Permissions(...CONTENT_UPDATE)
  @Patch(':id/revoke')
  revoke(
    @Param('id') id: string,
    @Body() dto: RevokeCertificateDto,
    @Request() req: ExpressRequest,
  ) {
    return this.requests.revoke(id, dto, req);
  }
}
