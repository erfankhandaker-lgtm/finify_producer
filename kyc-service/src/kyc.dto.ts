import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateCaseDto {
  @Matches(/^\d{7,15}$/)
  customerMsisdn: string;

  @IsIn(['UGANDA_NATIONAL_ID', 'PASSPORT'])
  documentType: string;

  @Matches(/^[A-Z]{3}$/)
  issuingCountry: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}

export class ReviewCaseDto {
  @IsIn(['APPROVE', 'REJECT', 'REQUEST_RESUBMISSION'])
  action: 'APPROVE' | 'REJECT' | 'REQUEST_RESUBMISSION';

  @IsString()
  @Length(3, 1000)
  reason: string;
}

export class DocumentRoleDto {
  @IsIn(['ID_FRONT', 'ID_BACK', 'PASSPORT', 'SELFIE'])
  role: string;
}
