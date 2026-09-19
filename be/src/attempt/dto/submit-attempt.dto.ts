import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class SubmitAttemptDto {
  @IsString()
  @IsNotEmpty()
  selectedAnswer!: string;

  @IsDateString()
  @IsOptional()
  startedAt?: string;
}
