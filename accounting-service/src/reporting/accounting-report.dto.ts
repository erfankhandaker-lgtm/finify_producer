import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const upper = ({ value }: { value: unknown }) => String(value).trim().toUpperCase();

export class AccountingReportQueryDto {
  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  dateFrom: string;

  @ApiProperty({ example: '2026-07-31' })
  @IsDateString()
  dateTo: string;

  @ApiPropertyOptional({ example: 'UGX', default: 'UGX' })
  @IsOptional()
  @Transform(upper)
  @Matches(/^(?:[A-Z]{3}|ALL)$/)
  currency = 'UGX';

  @ApiPropertyOptional({ example: 'FINIFY_UK', default: 'FINIFY_UK' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,32}$/)
  reportingEntity = 'FINIFY_UK';

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;
}

export class JournalReportQueryDto extends AccountingReportQueryDto {
  @ApiPropertyOptional({ description: 'Transaction ID, reference, keyword, or journal ID' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    enum: ['PROCESSING', 'RESERVED', 'SETTLED', 'COMPLETED', 'REVERSED', 'FAILED'],
  })
  @IsOptional()
  @Transform(upper)
  @IsIn(['PROCESSING', 'RESERVED', 'SETTLED', 'COMPLETED', 'REVERSED', 'FAILED'])
  status?: string;
}

export class GeneralLedgerQueryDto extends AccountingReportQueryDto {
  @ApiPropertyOptional({ example: '2000-CUSTOMER-WALLETS' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  accountCode?: string;

  @ApiPropertyOptional({ description: 'Journal, transaction, reference, or wallet account' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
