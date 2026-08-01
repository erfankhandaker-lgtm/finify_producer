import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateMerchantRefundDto {
  @ApiProperty({ example: '178524687792532057' })
  @IsString()
  @Matches(/^\d{8,24}$/)
  originalTransactionId: string;

  @ApiProperty({ example: 'REFUND-ORDER-1001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  refundReference: string;

  @ApiPropertyOptional({ example: 'Customer returned the goods' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ example: 'merchant-operator@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  requestedBy?: string;
}
