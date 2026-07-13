import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password: string;
}

export class AdminRefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class InitializeAdminDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9._-]+$/)
  @MaxLength(100)
  username: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  displayName: string;

  @IsString()
  @MinLength(12)
  @MaxLength(255)
  password: string;

  @IsOptional()
  @IsString()
  setupToken?: string;
}
