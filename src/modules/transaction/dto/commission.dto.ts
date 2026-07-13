import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumberString, IsString, Min } from 'class-validator';

export class CalculateCommissionDto {
  @IsString() @IsNotEmpty() transactionId: string;
  @IsString() @IsNotEmpty() keyword: string;
  @Type(() => Number) @IsInt() @Min(1) walletId: number;
  @IsNumberString() amount: string;
}
