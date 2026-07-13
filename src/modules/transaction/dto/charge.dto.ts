import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateChargeDto {
  @Type(() => Number) @IsInt() @Min(1) chargeId: number;
  @Type(() => Number) @IsIn([0, 1]) chargeType: number;
  @IsOptional() @IsDateString() expiryOn?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) defaultChargeId?: number;
  @IsOptional() @IsString() chargeDescription?: string;
  @IsString() @IsNotEmpty() maker: string;
}

export class UpdateChargeDto extends PartialType(CreateChargeDto) {
  @IsString() @IsNotEmpty() maker: string;
}

export class CreateChargeDetailDto {
  @Type(() => Number) @IsInt() @Min(1) chargeId: number;
  @IsIn(['0', '1', 'Flat', 'Percentage', 'flat', 'percentage']) chargeType: string;
  @IsNumberString() chargeValue: string;
  @IsOptional() @IsNumberString() startRange?: string;
  @IsOptional() @IsNumberString() endRange?: string;
  @ValidateIf(value => ['1', 'percentage'].includes(String(value.chargeType).toLowerCase()))
  @IsNumberString()
  minCharge?: string;
  @ValidateIf(value => ['1', 'percentage'].includes(String(value.chargeType).toLowerCase()))
  @IsNumberString()
  maxCharge?: string;
  @IsString() @IsNotEmpty() maker: string;
}

export class UpdateChargeDetailDto extends PartialType(CreateChargeDetailDto) {
  @IsString() @IsNotEmpty() maker: string;
}

export class CreateChargeMappingDto {
  @Type(() => Number) @IsInt() @Min(1) keywordChargeId: number;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsIn([0, 1]) isDefault: number;
  @IsString() @IsNotEmpty() maker: string;
}

export class UpdateChargeMappingDto extends PartialType(CreateChargeMappingDto) {
  @IsString() @IsNotEmpty() maker: string;
}

export class CreateKeywordChargeDto {
  @Type(() => Number) @IsInt() @Min(1) keywordChargeId: number;
  @IsString() @IsNotEmpty() keyword: string;
  @Type(() => Number) @IsInt() @Min(1) chargeId: number;
  @IsIn(['S', 'D']) payer: 'S' | 'D';
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsIn([0, 1]) isDefault: number;
  @Type(() => Number) @IsInt() @Min(1) walletId: number;
  @IsString() @IsNotEmpty() maker: string;
}

export class UpdateKeywordChargeDto extends PartialType(CreateKeywordChargeDto) {
  @IsString() @IsNotEmpty() maker: string;
}

export class ApproveChargeConfigDto {
  @IsString() @IsNotEmpty() checker: string;
}

export class DeactivateChargeConfigDto {
  @IsString() @IsNotEmpty() maker: string;
}

export class CalculateChargeDto {
  @IsString() @IsNotEmpty() transactionId: string;
  @IsString() @IsNotEmpty() keyword: string;
  @Type(() => Number) @IsInt() @Min(1) walletId: number;
  @IsNumberString() amount: string;
}
