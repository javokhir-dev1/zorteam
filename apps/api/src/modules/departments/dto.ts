import { DepartmentType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty({ message: "Bo'lim nomi kiritilishi shart" })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Kod kiritilishi shart' })
  code: string;

  @IsOptional()
  @IsEnum(DepartmentType)
  type?: DepartmentType;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  scheduleId?: string | null;
}

export class UpdateDepartmentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsEnum(DepartmentType) type?: DepartmentType;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsString() scheduleId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SetHeadsDto {
  /** Bo'limga rahbarlik qiladigan hodimlar ro'yxati */
  @IsArray()
  @IsString({ each: true })
  userIds: string[];
}
