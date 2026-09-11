import { IsBoolean, IsIn, IsObject, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

export class VerifyOnboardingOtpDto {
  @Matches(/^\d{4,8}$/) code: string;
}

export class CreateOnboardingPinDto {
  @Matches(/^\d{4,12}$/) pin: string;
  @Matches(/^\d{4,12}$/) confirmPin: string;
}

export class VerifyOnboardingPinDto {
  @Matches(/^\d{4,12}$/) pin: string;
}

export class AcceptOnboardingConsentDto {
  @IsUUID() consentVersionId: string;
  @IsBoolean() accepted: boolean;
}

export class SubmitOnboardingProfileDto {
  @IsUUID() formVersionId: string;
  @IsObject() response: Record<string, unknown>;
}

export class StartOnboardingKycDto {
  @IsIn(['UGANDA_NATIONAL_ID', 'PASSPORT']) documentType: string;
  @Matches(/^[A-Z]{3}$/) issuingCountry: string;
}

export class OnboardingKycDocumentDto {
  @IsIn(['ID_FRONT', 'ID_BACK', 'PASSPORT', 'SELFIE']) role: string;
}

export class OnboardingNodeCallbackDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{0,63}$/) nodeType: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{0,63}$/) outcome: string;
  @IsString() @Length(8, 120) idempotencyKey: string;
  @IsString() @MaxLength(120) reference: string;
  @IsObject() output: Record<string, unknown>;
}
