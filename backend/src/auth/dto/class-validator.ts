import { IsString, IsEmail, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString() username: string;

  @IsEmail() email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class LoginDto {
  @IsEmail() email: string;

  @IsString()
  password: string;
}