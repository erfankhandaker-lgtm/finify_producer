import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RunEodDto {
  @ApiProperty({ example: '2026-07-25', description: 'Local accounting business date to validate or close.' })
  @IsDateString() businessDate: string;
  @ApiProperty({ example: 'GBP', minLength: 3, maxLength: 3 })
  @IsString() @Matches(/^[A-Za-z]{3}$/) currency: string;
  @ApiPropertyOptional({ example: 'FINIFY_UK', default: 'FINIFY_UK' })
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{2,32}$/) reportingEntity = 'FINIFY_UK';
  @ApiProperty({ example: 'operations.user', description: 'Audit identity requesting the run.' })
  @IsString() @IsNotEmpty() requestedBy: string;
  @ApiPropertyOptional({ example: 'EOD-20260725-GBP', description: 'Caller-supplied trace identifier.' })
  @IsOptional() @IsString() correlationId?: string;
}

export class RunEodBatchDto {
  @ApiProperty({ example: '2026-07-25' })
  @IsDateString() businessDate: string;
  @ApiPropertyOptional({ example: 'FINIFY_UK', default: 'FINIFY_UK' })
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{2,32}$/) reportingEntity = 'FINIFY_UK';
  @ApiProperty({ example: 'operations.user' })
  @IsString() @IsNotEmpty() requestedBy: string;
  @ApiPropertyOptional({ example: 'EOD-BATCH-20260725' })
  @IsOptional() @IsString() correlationId?: string;
  @ApiPropertyOptional({ default: false, description: 'Validate all currencies without closing them.' })
  @IsOptional() @IsBoolean() dryRun = false;
}
