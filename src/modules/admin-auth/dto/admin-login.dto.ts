import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;
}

export class AdminMfaCodeDto {
  @IsUUID()
  challengeId: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}

export class AdminMfaChallengeDto {
  @IsUUID()
  challengeId: string;
}

export class AdminMfaRecoveryDto extends AdminMfaChallengeDto {
  @IsString()
  @Matches(/^\d{4}-?\d{4}-?\d{4}$/)
  recoveryPin: string;
}

export class AdminRefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class AdminFaceChallengeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  username: string;
}

export class AdminFaceVerifyDto {
  @IsUUID()
  challengeId: string;
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
