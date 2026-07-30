import {
  EvaluationTargetType,
  EvaluationTrigger,
  EvaluatorKind,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CriterionDto {
  @IsOptional() @IsString() id?: string;

  @IsString() @IsNotEmpty({ message: 'Mezon nomi kiritilishi shart' })
  name: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.1) @Max(10)
  weight?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(10)
  maxScore?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number;
}

export class UpsertRuleDto {
  @IsString() @IsNotEmpty({ message: 'Qoida nomi kiritilishi shart' })
  name: string;

  @IsEnum(EvaluationTargetType)
  targetType: EvaluationTargetType;

  @IsOptional() @IsEnum(EvaluationTrigger)
  trigger?: EvaluationTrigger;

  @IsEnum(EvaluatorKind, { message: "Baholovchi turi noto'g'ri" })
  evaluatorKind: EvaluatorKind;

  @IsOptional() @IsString() evaluatorUserId?: string | null;
  @IsOptional() @IsString() evaluatorDepartmentId?: string | null;
  @IsOptional() @IsString() targetDepartmentId?: string | null;
  @IsOptional() @IsString() targetCrewRoleId?: string | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(720)
  windowHours?: number;

  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CriterionDto)
  criteria?: CriterionDto[];
}

export class ScoreDto {
  @IsString() @IsNotEmpty()
  criterionId: string;

  @Type(() => Number) @IsNumber() @Min(0)
  score: number;
}

export class SubmitEvaluationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreDto)
  scores: ScoreDto[];

  @IsOptional() @IsString()
  comment?: string;
}
