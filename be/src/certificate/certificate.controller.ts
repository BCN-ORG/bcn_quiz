import { Controller, Get, Param, Query, Request } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CertificateService } from './certificate.service';
import { CertificateQueryDto } from './dto/certificate-query.dto';

@Controller('certificate')
export class CertificateController {
  constructor(private readonly certificateService: CertificateService) {}

  @Get('me')
  async getMyCertificates(
    @Query() query: CertificateQueryDto,
    @Request() req: ExpressRequest,
  ) {
    return this.certificateService.getMyCertificates(query, req);
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
