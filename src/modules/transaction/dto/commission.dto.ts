import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsNumberString, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CalculateCommissionDto {
  @IsString() @IsNotEmpty() transactionId: string;
  @IsString() @IsNotEmpty() keyword: string;
  @Type(() => Number) @IsInt() @Min(1) walletId: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) sourceWalletType?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) destinationWalletType?: number;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsNumberString() amount: string;
}

export class CreateCommissionDto {
  @Type(() => Number) @IsInt() @Min(1) commissionId: number;
  @Type(() => Number) @IsIn([0, 1]) commissionType: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() expiryOn?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) defaultCommissionId?: number;
  @IsString() @IsNotEmpty() maker: string;
}

export class CreateCommissionDetailDto {
  @Type(() => Number) @IsInt() @Min(1) commissionId: number;
  @IsIn(['0', '1', 'flat', 'percentage', 'Flat', 'Percentage']) commissionType: string;
  @IsNumberString() commissionValue: string;
  @IsOptional() @IsNumberString() startRange?: string;
  @IsOptional() @IsNumberString() endRange?: string;
  @IsOptional() @IsNumberString() minCommission?: string;
  @IsOptional() @IsNumberString() maxCommission?: string;
  @IsString() @IsNotEmpty() maker: string;
}
