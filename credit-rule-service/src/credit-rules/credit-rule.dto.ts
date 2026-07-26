import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min
} from 'class-validator';

const upper = ({ value }: { value: unknown }) => String(value).trim().toUpperCase();

export class CreateHttpIntegrationDto {
  @IsString() @IsNotEmpty() @MaxLength(100) code: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @IsIn(['GET','POST','PUT','PATCH']) method: 'GET'|'POST'|'PUT'|'PATCH' = 'GET';
  @IsString() @IsNotEmpty() urlTemplate: string;
  @IsOptional() @IsObject() requestTemplate?: Record<string, unknown>;
  @IsIn(['NONE','API_KEY','BEARER']) authType: 'NONE'|'API_KEY'|'BEARER' = 'NONE';
  @IsOptional() @IsString() @MaxLength(100) authHeader?: string;
  @IsOptional() @IsString() @MaxLength(150) authSecretEnv?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(120000) timeoutMs = 5000;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(86400) cacheTtlSeconds = 0;
}

export class UpdateHttpIntegrationDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsIn(['GET','POST','PUT','PATCH']) method?: 'GET'|'POST'|'PUT'|'PATCH';
  @IsOptional() @IsString() urlTemplate?: string;
  @IsOptional() @IsObject() requestTemplate?: Record<string, unknown>;
  @IsOptional() @IsIn(['NONE','API_KEY','BEARER']) authType?: 'NONE'|'API_KEY'|'BEARER';
  @IsOptional() @IsString() @MaxLength(100) authHeader?: string;
  @IsOptional() @IsString() @MaxLength(150) authSecretEnv?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(120000) timeoutMs?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(86400) cacheTtlSeconds?: number;
}

export class CreateScoreProviderDto {
  @IsString() @IsNotEmpty() @MaxLength(100) code: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @IsString() @IsNotEmpty() httpIntegrationId: string;
  @IsString() @IsNotEmpty() scoreResponsePath: string;
  @IsString() @IsNotEmpty() categoryResponsePath: string;
  @IsOptional() @IsString() modelIdResponsePath?: string;
  @IsOptional() @IsString() modelVersionResponsePath?: string;
  @IsOptional() @IsString() referenceResponsePath?: string;
  @IsOptional() @IsString() scoredAtResponsePath?: string;
  @IsOptional() @Type(() => Number) @IsNumber() scoreMin?: number;
  @IsOptional() @Type(() => Number) @IsNumber() scoreMax?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(525600) validityMinutes = 43200;
  @IsOptional() @IsBoolean() isDefault = false;
}

export class UpdateScoreProviderDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() httpIntegrationId?: string;
  @IsOptional() @IsString() scoreResponsePath?: string;
  @IsOptional() @IsString() categoryResponsePath?: string;
  @IsOptional() @IsString() modelIdResponsePath?: string;
  @IsOptional() @IsString() modelVersionResponsePath?: string;
  @IsOptional() @IsString() referenceResponsePath?: string;
  @IsOptional() @IsString() scoredAtResponsePath?: string;
  @IsOptional() @Type(() => Number) @IsNumber() scoreMin?: number;
  @IsOptional() @Type(() => Number) @IsNumber() scoreMax?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(525600) validityMinutes?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class CreateMasterRuleDto {
  @IsString() @IsNotEmpty() @MaxLength(100) ruleCode: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @Transform(upper) @IsString() @IsNotEmpty() @MaxLength(100) customerCategory: string;
  @IsString() @IsNotEmpty() @MaxLength(100) productId: string;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber() minimumScore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maximumScore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) baseLimit = 0;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumLimit = 0;
  @Type(() => Number) @IsNumber() @Min(0.01) maximumLimit: number;
  @IsOptional() @IsIn(['REJECTED','MANUAL_REVIEW']) defaultOutcome: 'REJECTED'|'MANUAL_REVIEW' = 'REJECTED';
  @IsOptional() @IsBoolean() autoApprovalEnabled = false;
  @IsOptional() @IsArray() @IsString({ each: true }) defaultRepaymentOptionIds: string[] = [];
  @IsOptional() @IsString() scoreProviderId?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class UpdateMasterRuleDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(100) customerCategory?: string;
  @IsOptional() @IsString() @MaxLength(100) productId?: string;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber() minimumScore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maximumScore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) baseLimit?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumLimit?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) maximumLimit?: number;
  @IsOptional() @IsIn(['REJECTED','MANUAL_REVIEW']) defaultOutcome?: 'REJECTED'|'MANUAL_REVIEW';
  @IsOptional() @IsBoolean() autoApprovalEnabled?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) defaultRepaymentOptionIds?: string[];
  @IsOptional() @IsString() scoreProviderId?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class CreateRuleDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) priority: number;
  @IsOptional() @IsString() @MaxLength(100) exclusiveGroup?: string;
  @IsIn(['AI_RESULT','POSTGRES','HTTP_API']) sourceType: 'AI_RESULT'|'POSTGRES'|'HTTP_API';
  @IsOptional() @IsString() aiResultField?: string;
  @IsOptional() @IsString() schemaName?: string;
  @IsOptional() @IsString() tableName?: string;
  @IsOptional() @IsString() lookupColumn?: string;
  @IsOptional() @IsString() valueColumn?: string;
  @IsOptional() @IsIn(['SINGLE','LATEST','SUM','AVERAGE','COUNT','MINIMUM','MAXIMUM','EXISTS'])
  readMode?: string;
  @IsOptional() @IsString() orderByColumn?: string;
  @IsOptional() @IsString() httpIntegrationId?: string;
  @IsOptional() @IsString() responsePath?: string;
  @IsIn(['STRING','DECIMAL','INTEGER','BOOLEAN','DATE','DATETIME']) dataType: string;
  @IsObject() condition: Record<string, unknown>;
  @IsObject() actionOnMatch: Record<string, unknown>;
  @IsOptional() @IsObject() actionOnNoMatch: Record<string, unknown> = { type: 'CONTINUE' };
  @IsOptional() @IsObject() sourceFailureAction: Record<string, unknown> = {
    type: 'MANUAL_REVIEW', reasonCode: 'DATA_SOURCE_UNAVAILABLE'
  };
  @IsOptional() @IsBoolean() stopOnMatch = false;
  @IsOptional() @IsBoolean() stopOnNoMatch = false;
}

export class UpdateRuleDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) priority?: number;
  @IsOptional() @IsString() @MaxLength(100) exclusiveGroup?: string;
  @IsOptional() @IsIn(['AI_RESULT','POSTGRES','HTTP_API']) sourceType?: string;
  @IsOptional() @IsString() aiResultField?: string;
  @IsOptional() @IsString() schemaName?: string;
  @IsOptional() @IsString() tableName?: string;
  @IsOptional() @IsString() lookupColumn?: string;
  @IsOptional() @IsString() valueColumn?: string;
  @IsOptional() @IsIn(['SINGLE','LATEST','SUM','AVERAGE','COUNT','MINIMUM','MAXIMUM','EXISTS'])
  readMode?: string;
  @IsOptional() @IsString() orderByColumn?: string;
  @IsOptional() @IsString() httpIntegrationId?: string;
  @IsOptional() @IsString() responsePath?: string;
  @IsOptional() @IsIn(['STRING','DECIMAL','INTEGER','BOOLEAN','DATE','DATETIME']) dataType?: string;
  @IsOptional() @IsObject() condition?: Record<string, unknown>;
  @IsOptional() @IsObject() actionOnMatch?: Record<string, unknown>;
  @IsOptional() @IsObject() actionOnNoMatch?: Record<string, unknown>;
  @IsOptional() @IsObject() sourceFailureAction?: Record<string, unknown>;
  @IsOptional() @IsBoolean() stopOnMatch?: boolean;
  @IsOptional() @IsBoolean() stopOnNoMatch?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ReviewDto {
  @IsOptional() @IsString() comment?: string;
}

export class RejectDto {
  @IsString() @IsNotEmpty() reason: string;
}

export class AiResultDto {
  @Type(() => Number) @IsNumber() score: number;
  @Transform(upper) @IsString() @IsNotEmpty() category: string;
  @IsOptional() @IsString() modelId?: string;
  @IsOptional() @IsString() modelVersion?: string;
  @IsOptional() @IsDateString() scoredAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() referenceId?: string;
}

export class EvaluateCreditDto {
  @ApiProperty({ example: '447700900123' })
  @IsString() @IsNotEmpty() customerId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() applicationId?: string;
  @ApiProperty({ example: '101' }) @IsString() @IsNotEmpty() productId: string;
  @ApiPropertyOptional({ example: 'GBP' })
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiProperty({ example: 2500 }) @Type(() => Number) @IsNumber() @Min(0) requestedAmount: number;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) existingExposure = 0;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) pendingReservations = 0;
  @ApiPropertyOptional({ type: AiResultDto })
  @IsOptional() @Type(() => AiResultDto) aiResult?: AiResultDto;
  @ApiPropertyOptional() @IsOptional() @IsString() scoreProviderCode?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() forceRescore = false;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() simulation = false;
  @ApiPropertyOptional() @IsOptional() @IsString() masterRuleId?: string;
}

export class ListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
}
