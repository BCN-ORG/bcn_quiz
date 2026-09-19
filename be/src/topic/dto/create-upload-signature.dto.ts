import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUploadSignatureDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  publicId?: string;
}
