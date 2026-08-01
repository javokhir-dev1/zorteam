import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTodoDto {
  @IsString()
  @IsNotEmpty({ message: 'Matn kiritilishi shart' })
  @MaxLength(500, { message: 'Matn 500 belgidan oshmasligi kerak' })
  text: string;
}

export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Matn bo‘sh bo‘lmasligi kerak' })
  @MaxLength(500, { message: 'Matn 500 belgidan oshmasligi kerak' })
  text?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}
