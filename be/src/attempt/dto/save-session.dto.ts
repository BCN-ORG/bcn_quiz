import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'sessionAnswersShape', async: false })
class SessionAnswersConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) {
      return true;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 500) {
      return false;
    }

    for (const [key, answer] of entries) {
      if (typeof key !== 'string' || key.length > 64) {
        return false;
      }
      if (typeof answer !== 'string' || answer.length > 64) {
        return false;
      }
    }

    return true;
  }

  defaultMessage(): string {
    return 'answers must be an object with at most 500 string entries (key/value length ≤ 64)';
  }
}

export class SaveSessionDto {
  @IsString()
  @IsOptional()
  currentQuizId?: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  selectedAnswer?: string;

  @IsObject()
  @IsOptional()
  @Validate(SessionAnswersConstraint)
  answers?: Record<string, string>;
}
