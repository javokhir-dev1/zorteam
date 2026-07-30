import { TaskPriority, TaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateTaskDto {
  @IsString() @IsNotEmpty({ message: 'Sarlavha kiritilishi shart' })
  title: string;

  @IsString()
  @MinLength(5, { message: "Tavsif kamida 5 belgidan iborat bo'lishi kerak" })
  description: string;

  @IsString() @IsNotEmpty({ message: "Qaysi bo'limga yuborilishi tanlanishi shart" })
  toDepartmentId: string;

  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsString() showId?: string;
  @IsOptional() @IsString() episodeId?: string;

  /** So'rov muallifi taklif qilgan muddat (rahbar o'zgartirishi mumkin) */
  @IsOptional() @IsDateString() desiredDeadline?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  fileIds?: string[];
}

export class AcceptTaskDto {
  @IsString() @IsNotEmpty({ message: 'Ijrochi tanlanishi shart' })
  assigneeId: string;

  @IsDateString({}, { message: 'Muddat kiritilishi shart' })
  deadlineAt: string;

  @IsOptional() @IsString() note?: string;
}

export class RejectTaskDto {
  @IsString()
  @MinLength(5, { message: 'Rad etish sababi kiritilishi shart' })
  reason: string;
}

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status: TaskStatus;

  @IsOptional() @IsString() comment?: string;
}

export class CommentDto {
  @IsString() @MinLength(1)
  body: string;
}

export class ListTasksQuery {
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsString() toDepartmentId?: string;
  @IsOptional() @IsString() fromDepartmentId?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() showId?: string;
  /** 'true' — faqat muddati o'tganlar */
  @IsOptional() @IsString() overdue?: string;
  /** 'mine' — menga tegishlilar */
  @IsOptional() @IsString() scope?: string;
  @IsOptional() @Type(() => Number) @IsInt() take?: number;
  @IsOptional() @Type(() => Number) @IsInt() skip?: number;
}
