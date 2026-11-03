import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUploadSignatureDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  publicId?: string;

  /**
   * POST returns a presigned POST policy enforced by the storage server.
   * Omitted or PUT keeps the legacy presigned PUT (unless UPLOAD_ALLOW_LEGACY_PUT=false).
   * Only honoured by the learner submission upload endpoint.
   */
  @IsOptional()
  @IsIn(['PUT', 'POST'])
  method?: 'PUT' | 'POST';
}
