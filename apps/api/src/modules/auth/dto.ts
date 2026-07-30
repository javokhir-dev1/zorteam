import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** Telefon raqam yoki email */
  @IsString()
  @IsNotEmpty({ message: 'Login kiritilishi shart' })
  login: string;

  @IsString()
  @MinLength(4, { message: "Parol kamida 4 belgidan iborat bo'lishi kerak" })
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @MinLength(6, { message: "Yangi parol kamida 6 belgidan iborat bo'lishi kerak" })
  newPassword: string;
}
