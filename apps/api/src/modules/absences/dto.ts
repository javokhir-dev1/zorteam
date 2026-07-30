import { AbsenceStatus, AbsenceType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAbsenceDto {
  @IsString() @IsNotEmpty({ message: 'Hodim tanlanishi shart' })
  userId: string;

  @IsEnum(AbsenceType, { message: "Yo'qlik turi noto'g'ri" })
  type: AbsenceType;

  /** YYYY-MM-DD */
  @IsString() @IsNotEmpty({ message: 'Boshlanish sanasi kiritilishi shart' })
  startDate: string;

  @IsString() @IsNotEmpty({ message: 'Tugash sanasi kiritilishi shart' })
  endDate: string;

  @IsString()
  @MinLength(5, { message: "Sabab kamida 5 belgidan iborat bo'lishi kerak" })
  reason: string;

  @IsOptional() @IsString()
  attachmentId?: string;
}

export class DecideAbsenceDto {
  /** Faqat APPROVED yoki REJECTED qabul qilinadi */
  @IsEnum(AbsenceStatus)
  status: AbsenceStatus;

  @IsOptional() @IsString()
  note?: string;
}

export class ListAbsencesQuery {
  @IsOptional() @IsEnum(AbsenceStatus) status?: AbsenceStatus;
  @IsOptional() @IsEnum(AbsenceType) type?: AbsenceType;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}
