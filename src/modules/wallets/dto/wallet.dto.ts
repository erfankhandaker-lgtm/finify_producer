import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateAdditionalWalletDto {
  @ApiProperty({ example: 215, description: 'Active customer wallet type (Wallet_Type=100).' })
  @Type(() => Number) @IsInt() @Min(1) walletCode: number;

  @ApiProperty({ example: 'GBP' })
  @Transform(({ value }) => String(value).trim().toUpperCase())
  @Matches(/^[A-Z]{3}$/) currency: string;
}

export class WalletTransactionQueryDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
  @ApiPropertyOptional({ example: '2026-07-01' }) @IsOptional() @IsString() dateFrom?: string;
  @ApiPropertyOptional({ example: '2026-07-31' }) @IsOptional() @IsString() dateTo?: string;
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
