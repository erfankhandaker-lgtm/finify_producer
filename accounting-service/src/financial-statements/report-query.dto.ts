import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

const upper = ({ value }: { value: unknown }) => String(value).trim().toUpperCase();

export class DailyReportQueryDto {
  @ApiProperty({ example: '2026-07-25' }) @IsDateString() businessDate: string;
  @ApiPropertyOptional({ example: 'GBP', default: 'GBP' })
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/) currency = 'GBP';
  @ApiPropertyOptional({ example: 'FINIFY_UK', default: 'FINIFY_UK' })
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{2,32}$/) reportingEntity = 'FINIFY_UK';
}

export class ConsolidatedReportQueryDto {
  @ApiProperty({ example: '2026-07-25' }) @IsDateString() businessDate: string;
  @ApiPropertyOptional({ example: 'GBP', default: 'GBP' })
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/) baseCurrency = 'GBP';
  @ApiPropertyOptional({ example: 'FINIFY_UK', default: 'FINIFY_UK' })
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{2,32}$/) reportingEntity = 'FINIFY_UK';
}

export class PeriodReportQueryDto {
  @ApiProperty({ example: '2026-07-01' }) @IsDateString() dateFrom: string;
  @ApiProperty({ example: '2026-07-31' }) @IsDateString() dateTo: string;
  @ApiPropertyOptional({ example: 'GBP', default: 'GBP' })
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/) currency = 'GBP';
  @ApiPropertyOptional({ example: 'FINIFY_UK', default: 'FINIFY_UK' })
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{2,32}$/) reportingEntity = 'FINIFY_UK';
}
