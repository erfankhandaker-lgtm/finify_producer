import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAccountingConfigDto {
  @ApiProperty({ example: 'FINIFY_UK' })
  @IsString() @Matches(/^[A-Za-z0-9_-]{2,32}$/) reportingEntity = 'FINIFY_UK';
  @ApiProperty({ example: 'GBP' })
  @IsString() @Matches(/^[A-Za-z]{3}$/) currency: string;
  @ApiProperty({ example: 'GBP', default: 'GBP' })
  @IsString() @Matches(/^[A-Za-z]{3}$/) baseCurrency = 'GBP';
  @ApiProperty({ example: 'Europe/London' })
  @IsString() @MaxLength(100) businessTimezone = 'Europe/London';
  @ApiProperty({ example: '00:00:00', description: 'Local cutoff in businessTimezone.' })
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/) cutoffTime = '00:00:00';
  @ApiProperty({ example: '9800001110', description: 'Active master safeguarding wallet.' })
  @IsString() @Matches(/^\d+$/) masterWallet: string;
  @ApiPropertyOptional({ default: true })
  @IsOptional() @Type(() => Boolean) @IsBoolean() strictSafeguarding = true;
  @ApiProperty({ example: '2026-08-01' })
  @IsDateString() effectiveFrom: string;
  @ApiProperty({ example: 'maker.user' })
  @IsString() @IsNotEmpty() maker: string;
  @ApiProperty({ example: 'checker.user', description: 'Must differ from maker.' })
  @IsString() @IsNotEmpty() checker: string;
}
