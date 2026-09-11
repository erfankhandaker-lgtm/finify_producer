import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreditCommercialConfigurationDto {
  @IsString() @IsNotEmpty() @MaxLength(100) productId!: string;
  @IsString() @IsNotEmpty() @MaxLength(3) countryCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(3) currency!: string;
  @IsString() @IsNotEmpty() @MaxLength(30) channel!: string;
  @IsIn(['TEST', 'PRODUCTION']) environmentScope!: 'TEST' | 'PRODUCTION';
  @IsUUID() merchantId!: string;
  @IsUUID() lenderId!: string;
  @Type(() => Number) @IsNumber() @Min(0.000001) allocationWeight!: number;
  @Type(() => Number) @IsInt() @Min(1) customerWalletTypeCode!: number;
  @Type(() => Number) @IsInt() @Min(1) settlementWalletTypeCode!: number;
  @IsString() @IsNotEmpty() @MaxLength(100) fineractTenant!: string;
  @Type(() => Number) @IsInt() @Min(1) fineractProductId!: number;
  @IsString() @IsNotEmpty() @MaxLength(200) fineractProductName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) pricingRuleCode!: string;
  @IsIn(['FLAT', 'DECLINING_BALANCE', 'HPA', 'REVOLVING']) interestMethod!:
    | 'FLAT' | 'DECLINING_BALANCE' | 'HPA' | 'REVOLVING';
  @Type(() => Number) @IsNumber() @Min(0) nominalInterestRate!: number;
  @IsIn(['DAILY', 'MONTHLY', 'ANNUAL']) interestRatePeriod!: 'DAILY' | 'MONTHLY' | 'ANNUAL';
  @Type(() => Number) @IsInt() @Min(1) repaymentFrequency!: number;
  @IsIn(['DAYS', 'WEEKS', 'MONTHS']) repaymentFrequencyType!: 'DAYS' | 'WEEKS' | 'MONTHS';
  @Type(() => Number) @IsInt() @Min(1) minimumRepayments!: number;
  @Type(() => Number) @IsInt() @Min(1) defaultRepayments!: number;
  @Type(() => Number) @IsInt() @Min(1) maximumRepayments!: number;
  @IsIn(['FLAT', 'PERCENT']) processingFeeType!: 'FLAT' | 'PERCENT';
  @Type(() => Number) @IsNumber() @Min(0) processingFeeValue!: number;
  @IsIn(['FLAT', 'PERCENT']) lateFeeType!: 'FLAT' | 'PERCENT';
  @Type(() => Number) @IsNumber() @Min(0) lateFeeValue!: number;
  @IsBoolean() earlySettlementAllowed!: boolean;
  @IsIn(['FLAT', 'PERCENT']) earlySettlementFeeType!: 'FLAT' | 'PERCENT';
  @Type(() => Number) @IsNumber() @Min(0) earlySettlementFeeValue!: number;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) chargeCodes!: string[];
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) commissionCodes!: string[];
  @IsString() @IsNotEmpty() @MaxLength(500) sourceReference!: string;
}

export class CreateCreditCommercialConfigurationDto extends CreditCommercialConfigurationDto {
  @IsString() @IsNotEmpty() @MaxLength(100) code!: string;
}

export class UpdateCreditCommercialConfigurationDto extends CreditCommercialConfigurationDto {
  @Type(() => Number) @IsInt() @Min(1) expectedRevision!: number;
}

export class CreditCommercialTransitionDto {
  @Type(() => Number) @IsInt() @Min(1) expectedRevision!: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class SimulateCreditCommercialConfigurationDto {
  @IsString() @IsNotEmpty() productId!: string;
  @IsString() @IsNotEmpty() countryCode!: string;
  @IsString() @IsNotEmpty() currency!: string;
  @IsString() @IsNotEmpty() channel!: string;
  @IsIn(['TEST', 'PRODUCTION']) environmentScope!: 'TEST' | 'PRODUCTION';
  @Type(() => Number) @IsNumber() @Min(0.01) principal!: number;
}
