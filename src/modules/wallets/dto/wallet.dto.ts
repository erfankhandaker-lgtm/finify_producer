import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAdditionalWalletDto {
  @ApiProperty({ example: 103, description: 'Active customer wallet type (Wallet_Type=100).' })
  @Type(() => Number) @IsInt() @Min(1) walletCode: number;

  @ApiProperty({ example: 'GBP' })
  @Transform(({ value }) => String(value).trim().toUpperCase())
  @Matches(/^[A-Z]{3}$/) currency: string;

  @ApiPropertyOptional({ example: 'GB82WEST12345698765432' })
  @IsOptional() @IsString() @MaxLength(42) iban?: string;

  @ApiPropertyOptional({ example: 'DEUTDEFF500' })
  @IsOptional() @IsString() @MaxLength(16) swiftBic?: string;

}

export class CreateCustomerWithWalletDto {
  @ApiProperty({ example: '447700900123' })
  @Matches(/^\d{7,15}$/) msisdn: string;

  @ApiProperty({ example: 'Amina' })
  @IsString() @IsNotEmpty() @MaxLength(100) firstName: string;

  @ApiPropertyOptional({ example: 'Nsubuga' })
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;

  @ApiPropertyOptional({ example: 'amina@example.test' })
  @IsOptional() @IsString() @MaxLength(254) email?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500) address?: string;

  @ApiProperty({ example: 'GBP' })
  @Transform(({ value }) => String(value).trim().toUpperCase())
  @Matches(/^[A-Z]{3}$/) defaultCurrency: string;

  @ApiPropertyOptional({ example: 103, default: 103, description: 'Active customer wallet type selected for the default account.' })
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) walletCode?: number;

  @ApiPropertyOptional({ example: 'GB82WEST12345698765432' })
  @IsOptional() @IsString() @MaxLength(42) iban?: string;

  @ApiPropertyOptional({ example: 'DEUTDEFF500' })
  @IsOptional() @IsString() @MaxLength(16) swiftBic?: string;

  @ApiPropertyOptional({ enum: ['UGANDA_NATIONAL_ID', 'PASSPORT'], default: 'UGANDA_NATIONAL_ID' })
  @IsOptional() @IsIn(['UGANDA_NATIONAL_ID', 'PASSPORT']) documentType?: string;

  @ApiPropertyOptional({ example: 'UGA', default: 'UGA' })
  @IsOptional()
  @Transform(({ value }) => String(value).trim().toUpperCase())
  @Matches(/^[A-Z]{3}$/) issuingCountry?: string;
}

export class UpdateWalletRoutingDto {
  @ApiPropertyOptional({ example: 'GB82WEST12345698765432', nullable: true })
  @IsOptional() @IsString() @MaxLength(42) iban?: string;

  @ApiPropertyOptional({ example: 'DEUTDEFF500', nullable: true })
  @IsOptional() @IsString() @MaxLength(16) swiftBic?: string;
}

export class WalletTransactionQueryDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
  @ApiPropertyOptional({ example: '2026-07-01' }) @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional({ example: '2026-07-31' }) @IsOptional() @IsDateString() dateTo?: string;
}

export class AdminWalletQueryDto extends WalletTransactionQueryDto {
  @ApiPropertyOptional({ example: '447700900123' }) @IsOptional() @Matches(/^\d+$/) ownerMsisdn?: string;
  @ApiPropertyOptional({ enum: ['CUSTOMER','AGENT','MERCHANT','SYSTEM'] })
  @IsOptional() @IsIn(['CUSTOMER','AGENT','MERCHANT','SYSTEM']) ownerType?: string;
  @ApiPropertyOptional({ example: 'GBP' })
  @IsOptional() @Transform(({ value }) => String(value).trim().toUpperCase()) @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @Type(() => Number) @IsInt() status?: number;
}

export class ChangeWalletStatusDto {
  @ApiProperty({ enum: ['ACTIVE','SUSPENDED','FROZEN','CLOSED'] })
  @IsIn(['ACTIVE','SUSPENDED','FROZEN','CLOSED']) status: 'ACTIVE'|'SUSPENDED'|'FROZEN'|'CLOSED';
  @ApiProperty({ example: 'Customer requested temporary freeze' })
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}
