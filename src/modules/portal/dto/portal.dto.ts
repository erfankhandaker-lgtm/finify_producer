import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class PortalActivityQueryDto {
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() walletId?: string;
}

export class PortalPaymentDto {
  @IsString() @Matches(/^\d+$/) sourceWalletId: string;
  @IsString() @Matches(/^\d+$/) destinationWalletId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @Transform(({ value }) => String(value || '').trim().toUpperCase())
  @IsString() @Matches(/^[A-Z0-9]{1,5}$/) keyword: string;
  @IsString() @IsNotEmpty() pin: string;
  @Transform(({ value }) => String(value || '').trim().toUpperCase())
  @IsString() @Matches(/^[A-Z]{3}$/) currency: string;
  @IsOptional() @IsString() referenceId?: string;
}

export class ChangePortalPinDto {
  @IsString() @IsNotEmpty() currentPin: string;
  @IsString() @Matches(/^\d{4,8}$/) newPin: string;
}
