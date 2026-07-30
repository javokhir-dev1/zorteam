import { AttendanceMethod, AttendanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CheckInDto {
  @Type(() => Number)
  @IsNumber({}, { message: "Joylashuv aniqlanmadi" })
  latitude: number;

  @Type(() => Number)
  @IsNumber({}, { message: "Joylashuv aniqlanmadi" })
  longitude: number;

  /** GPS aniqligi, metrda */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracy?: number;

  @IsOptional()
  @IsString()
  deviceInfo?: string;
}

export class ManualAttendanceDto {
  @IsString() @IsNotEmpty()
  userId: string;

  /** YYYY-MM-DD */
  @IsString() @IsNotEmpty()
  date: string;

  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  /** HH:mm — belgilangan vaqt */
  @IsOptional() @IsString()
  checkInTime?: string;

  @IsString()
  @IsNotEmpty({ message: 'Izoh kiritilishi shart' })
  note: string;
}

export class AttendanceQuery {
  /** YYYY-MM-DD */
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsEnum(AttendanceStatus) status?: AttendanceStatus;
  @IsOptional() @IsEnum(AttendanceMethod) method?: AttendanceMethod;
  /** 'true' bo'lsa faqat shubhali belgilar borlari */
  @IsOptional() @IsString() flagged?: string;
  @IsOptional() @Type(() => Number) take?: number;
  @IsOptional() @Type(() => Number) skip?: number;
}
