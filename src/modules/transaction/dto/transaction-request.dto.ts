import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsNotEmpty, IsDate, IsIn, IsInt, Min } from 'class-validator';

/**
 * DTO for creating a new Transaction Request.
 * Most properties are optional as the database schema provides default values.
 * We include the core fields required for a new transaction.
 */
export class CreateTransactionRequestDto {
  @ApiProperty({
    description: 'The keyword for the transaction type (e.g., "CashIn")',
    required: false,
  })
  @IsString()
  @IsOptional()
  keyword: string;

  @ApiProperty({
    description: 'The ID of the source wallet.',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  sourceWalletId: string;

  @ApiProperty({
    description: 'The ID of the destination wallet.',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  destWalletId: string;

  @ApiProperty({
    description: 'The amount of the transaction.',
    required: true,
  })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    description: 'The full name of the destination wallet user.',
    required: false,
  })
  @IsString()
  @IsOptional()
  destWalletFullname: string;

  @ApiProperty({
    description: 'The currency of the transaction. Default is BDT.',
    required: false,
  })
  @IsString()
  @IsOptional()
  currency: string;

  @ApiProperty({
    description: 'The pin for the transaction.',
    required: false,
  })
  @IsString()
  @IsOptional()
  pin: string;

  @ApiProperty({
    description: 'Additional remarks for the transaction.',
    required: false,
  })
  @IsString()
  @IsOptional()
  remarks: string;
}

/**
 * DTO for updating an existing Transaction Request.
 * All fields are optional except for the primary key `transactionId`.
 * The `PartialType` utility makes all properties of `CreateTransactionRequestDto` optional.
 */
export class UpdateTransactionRequestDto  {
  @ApiProperty({
    description: 'The unique identifier for the transaction to update.',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @ApiProperty({
    description: 'The status of the transaction.',
    required: false,
  })

  @IsOptional()
  transactionStatus?: bigint;

  @ApiProperty({
    description: 'The ID of the fee payer.',
    required: false,
  })
  @IsString()
  @IsOptional()
  feePayer: string;

  @ApiProperty({
    description: 'The ID of the commission receiver.',
    required: false,
  })
  @IsString()
  @IsOptional()
  commissionReceiver: string;

  @IsOptional()
  transactionFee?: string;

  @IsOptional()
  transactionCommission?: string;
}

export class PaginationDto {
  @IsOptional()
  accountnumber?: string;
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  limit: number = 10;
}
