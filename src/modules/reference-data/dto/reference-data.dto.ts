import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateKeywordDto {
  @ApiProperty({ example: 'PMNT', minLength: 1, maxLength: 5 })
  @Transform(upper)
  @IsString()
  @Length(1, 5)
  keyword: string;

  @ApiPropertyOptional({ example: 'Merchant payment', maxLength: 100 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keywordDescription?: string;

  @ApiPropertyOptional({ enum: ['C', 'M', 'A', 'S'], description: 'Allowed destination wallet scope: customer, merchant, agent, or system.' })
  @Transform(upper)
  @IsOptional()
  @IsIn(['C', 'M', 'A', 'S'])
  keywordScope?: string;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isFinancial?: boolean;
  @ApiPropertyOptional({ enum: ['Y', 'N'], default: 'N' }) @Transform(upper) @IsOptional() @IsIn(['Y', 'N']) chargeable?: string;
  @ApiPropertyOptional({ enum: ['S', 'D'], description: 'Wallet used to look up charge configuration.' }) @Transform(upper) @IsOptional() @IsIn(['S', 'D']) kcIdLookup?: string;
  @ApiPropertyOptional({ enum: ['Y', 'N'], default: 'N' }) @Transform(upper) @IsOptional() @IsIn(['Y', 'N']) commissionable?: string;
  @ApiPropertyOptional({ enum: ['S', 'D'], description: 'Wallet used to look up commission configuration.' }) @Transform(upper) @IsOptional() @IsIn(['S', 'D']) kcmIdLookup?: string;

  @ApiPropertyOptional({ minimum: 0.01, default: 1 })
  @Type(() => Number) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  minimumTranAmount?: number;

  @ApiPropertyOptional({ maxLength: 10 }) @Transform(trim) @IsOptional() @IsString() @MaxLength(10) involvedParty?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() applyTds?: boolean;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isRewardApplicable?: boolean;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isSystemKeyword?: boolean;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() serviceStatus?: boolean;
  @ApiPropertyOptional({ enum: ['S', 'D'], default: 'D' }) @Transform(upper) @IsOptional() @IsIn(['S', 'D']) vatSource?: string;
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @Type(() => Number) @IsOptional() @IsInt() @Min(1) vatId?: number;
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsString() keywordDescriptionLocal?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isCategoryService?: boolean;
  @ApiPropertyOptional({ minimum: 0 }) @Type(() => Number) @IsOptional() @IsInt() @Min(0) priority?: number;
  @ApiPropertyOptional({ maxLength: 6 }) @Transform(upper) @IsOptional() @IsString() @MaxLength(6) reverseKeyword?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ description: 'Reason supplied by the maker.' }) @Transform(trim) @IsOptional() @IsString() makerComment?: string;
}

export class UpdateKeywordDto extends PartialType(OmitType(CreateKeywordDto, ['keyword'] as const)) {}

export class CreateWalletTypeDto {
  @ApiProperty({ example: 200 }) @Type(() => Number) @IsInt() @Min(1) walletId: number;
  @ApiProperty({ example: 'Merchant wallet', maxLength: 50 }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(50) walletName: string;
  @ApiPropertyOptional({ maxLength: 50 }) @Transform(trim) @IsOptional() @IsString() @MaxLength(50) walletDetails?: string;
  @ApiPropertyOptional({ enum: [0, 1], default: 0 }) @Type(() => Number) @IsOptional() @IsIn([0, 1]) isKycNeeded?: number;
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @Type(() => Number) @IsOptional() @IsInt() @Min(1) defaultCommissionId?: number;
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @Type(() => Number) @IsOptional() @IsInt() @Min(1) defaultChargeId?: number;
  @ApiPropertyOptional({ example: 200, description: 'Broad wallet class used by transaction routing.' }) @Type(() => Number) @IsOptional() @IsInt() @Min(1) walletType?: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isCharge?: boolean;
  @ApiPropertyOptional({ minimum: 0 }) @Type(() => Number) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) fee?: number;
  @ApiPropertyOptional({ minimum: 0 }) @Type(() => Number) @IsOptional() @IsInt() @Min(0) hierarchy?: number;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() status?: boolean;
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsString() walletNameLocal?: string;
  @ApiPropertyOptional({ description: 'Reason supplied by the maker.' }) @Transform(trim) @IsOptional() @IsString() makerComment?: string;
}

export class UpdateWalletTypeDto extends PartialType(OmitType(CreateWalletTypeDto, ['walletId'] as const)) {}

export class CreateAmlConfigurationDto {
  @ApiProperty({ example: 203, description: 'Specific wallet code; references SW_TBL_WALLET_TYPE.Wallet_ID.' })
  @Type(() => Number) @IsInt() @Min(1)
  walletCode: number;

  @ApiProperty({ example: 'PMNT', minLength: 1, maxLength: 5 })
  @Transform(upper) @IsString() @Length(1, 5)
  keyword: string;

  @ApiProperty({ example: 5000, minimum: 0.01 })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  maxTransactionAmount: number;

  @ApiProperty({ example: 25000, minimum: 0.01 })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  dailyMaxAmount: number;

  @ApiProperty({ example: 25, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  dailyTransactionCount: number;

  @ApiProperty({ example: 250000, minimum: 0.01 })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  monthlyMaxAmount: number;

  @ApiProperty({ example: 250, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  monthlyTransactionCount: number;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Reason supplied by the maker.' })
  @Transform(trim) @IsOptional() @IsString() @MaxLength(2000)
  makerComment?: string;
}

export class UpdateAmlConfigurationDto extends PartialType(
  OmitType(CreateAmlConfigurationDto, ['walletCode', 'keyword'] as const),
) {}

export class ReviewChangeDto {
  @ApiPropertyOptional({ description: 'Checker comment recorded in the audit history.' })
  @Transform(trim) @IsOptional() @IsString() @MaxLength(2000)
  comment?: string;
}

export class RejectChangeDto {
  @ApiProperty({ description: 'Required reason for rejection.' })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000)
  reason: string;
}

export class ReferenceListQueryDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 25 }) @Type(() => Number) @IsOptional() @IsInt() @Min(1) limit = 25;
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: ['true', 'false'] }) @IsOptional() @IsIn(['true', 'false']) active?: string;
}

export class AmlConfigurationListQueryDto extends ReferenceListQueryDto {
  @ApiPropertyOptional({ description: 'Filter by the specific wallet code.' })
  @Type(() => Number) @IsOptional() @IsInt() @Min(1)
  walletCode?: number;

  @ApiPropertyOptional({ description: 'Filter by keyword.' })
  @Transform(upper) @IsOptional() @IsString() @Length(1, 5)
  keyword?: string;
}

export class ChangeRequestListQueryDto extends ReferenceListQueryDto {
  @ApiPropertyOptional({ enum: ['KEYWORD', 'WALLET_TYPE', 'AML'] }) @Transform(upper) @IsOptional() @IsIn(['KEYWORD', 'WALLET_TYPE', 'AML']) resourceType?: string;
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] }) @Transform(upper) @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']) status?: string;
}
