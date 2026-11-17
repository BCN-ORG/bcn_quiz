import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FloorDistributionRuleDto {
  @IsNumber()
  minFloor!: number;

  @IsNumber()
  maxFloor!: number;

  @IsObject()
  subjectWeights!: Record<string, number>;

  @IsObject()
  difficultyWeights!: Record<string, number>;
}

export class UpdateDistributionConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FloorDistributionRuleDto)
  rules!: FloorDistributionRuleDto[];
}
