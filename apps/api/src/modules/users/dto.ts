import { SystemRole, UserStatus } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'Ism sharif kiritilishi shart' })
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Vazifasi kiritilishi shart' })
  position: string;

  @IsOptional() @IsString() employeeNo?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() scheduleId?: string | null;
  @IsOptional() @IsDateString() hiredAt?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(SystemRole, { each: true })
  roles?: SystemRole[];

  /** Admin panelga kirish uchun parol (faqat panel huquqi borlarga) */
  @IsOptional()
  @MinLength(6, { message: "Parol kamida 6 belgidan iborat bo'lishi kerak" })
  password?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() employeeNo?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() scheduleId?: string | null;
  @IsOptional() @IsDateString() hiredAt?: string;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;

  @IsOptional()
  @IsArray()
  @IsEnum(SystemRole, { each: true })
  roles?: SystemRole[];

  @IsOptional()
  @MinLength(6)
  password?: string;
}

export class ListUsersQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsEnum(SystemRole) role?: SystemRole;
  @IsOptional() @IsString() linked?: string; // 'true' | 'false' — Telegramga ulanganmi
  @IsOptional() take?: number;
  @IsOptional() skip?: number;
}
