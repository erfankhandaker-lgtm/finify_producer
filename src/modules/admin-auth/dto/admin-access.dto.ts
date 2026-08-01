import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AdminUserStatus } from '../entities';

export class CreateAdminRoleDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9_]*$/)
  @MaxLength(100)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissionIds: string[];
}

export class UpdateAdminRoleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissionIds?: string[];
}

export class CreateAdminUserDto {
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

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleIds: string[];
}

export class UpdateAdminUserDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(255)
  password?: string;

  @IsOptional()
  @IsEnum(AdminUserStatus)
  status?: AdminUserStatus;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleIds?: string[];
}

export class UpdateAdminBiometricDto {
  @IsBoolean()
  enabled: boolean;
}

export class UpdateAdminSecuritySettingsDto {
  @IsBoolean()
  captchaEnabled: boolean;

  @IsString()
  @MaxLength(255)
  turnstileSiteKey: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  turnstileSecret?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  mfaIssuer: string;
}
