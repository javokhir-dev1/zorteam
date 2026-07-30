import { EpisodeStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateShowDto {
  @IsString() @IsNotEmpty({ message: "Ko'rsatuv nomi kiritilishi shart" })
  name: string;

  @IsString() @IsNotEmpty({ message: 'Kod kiritilishi shart' })
  code: string;

  @IsString() @IsNotEmpty({ message: 'Prodakshn tanlanishi shart' })
  productionId: string;

  @IsOptional() @IsString() description?: string;
}

export class UpdateShowDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() productionId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SetShowLeadersDto {
  @IsArray() @IsString({ each: true })
  userIds: string[];
}

export class CreateEpisodeDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @Type(() => Number) @IsInt() number?: number;
  @IsOptional() @IsDateString() recordAt?: string;
  @IsOptional() @IsDateString() airAt?: string;
  @IsOptional() @IsString() location?: string;
}

export class UpdateEpisodeDto extends CreateEpisodeDto {
  @IsOptional() @IsEnum(EpisodeStatus) status?: EpisodeStatus;
}

export class AssignDto {
  @IsString() @IsNotEmpty({ message: 'Hodim tanlanishi shart' })
  userId: string;

  @IsString() @IsNotEmpty({ message: 'Rol tanlanishi shart' })
  crewRoleId: string;

  @IsOptional() @IsString() note?: string;
}

export class UpsertCrewRoleDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() code: string;
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
