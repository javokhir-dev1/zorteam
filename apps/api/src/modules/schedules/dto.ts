import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class ScheduleDayDto {
  @IsInt() @Min(1) @Max(7)
  weekday: number;

  @IsBoolean()
  isWorkday: boolean;

  @Matches(TIME_RE, { message: "Vaqt HH:mm ko'rinishida bo'lishi kerak" })
  startTime: string;

  @Matches(TIME_RE, { message: "Vaqt HH:mm ko'rinishida bo'lishi kerak" })
  endTime: string;
}

export class UpsertScheduleDto {
  @IsString()
  @IsNotEmpty({ message: 'Grafik nomi kiritilishi shart' })
  name: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() requireCheckOut?: boolean;

  /** Necha daqiqagacha kechikish "vaqtida" hisoblanadi */
  @IsOptional() @IsInt() @Min(0) @Max(120) graceMinutes?: number;

  /** Belgilanish oynasi necha daqiqadan keyin yopiladi */
  @IsOptional() @IsInt() @Min(5) @Max(240) windowMinutes?: number;

  /** Eslatma necha daqiqadan keyin yuboriladi */
  @IsOptional() @IsInt() @Min(1) @Max(120) reminderMinutes?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleDayDto)
  days?: ScheduleDayDto[];
}

export class UpsertOfficeDto {
  @IsString() @IsNotEmpty({ message: 'Ofis nomi kiritilishi shart' })
  name: string;

  @IsOptional() @IsString() address?: string;

  @IsNumber() @Min(-90) @Max(90)
  latitude: number;

  @IsNumber() @Min(-180) @Max(180)
  longitude: number;

  @IsOptional() @IsInt() @Min(20) @Max(5000)
  radiusMeters?: number;

  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertCalendarDayDto {
  @IsString() @IsNotEmpty()
  date: string; // YYYY-MM-DD

  @IsString() @IsNotEmpty()
  name: string;

  @IsOptional() @IsBoolean()
  isWorkday?: boolean;
}
