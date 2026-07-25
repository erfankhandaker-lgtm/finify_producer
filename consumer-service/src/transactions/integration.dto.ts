import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class FieldMappingDto {
  @ApiProperty({ example: 'message.TransactionId', description: 'Source path: message.*, transaction.*, system.*, secret.*, or literalValue.' })
  @IsString()
  source: string;

  @ApiProperty({ example: 'payment.id', description: 'Outgoing field/tag. Dot notation creates nested JSON.' })
  @IsString()
  target: string;

  @ApiPropertyOptional({ enum: ['body', 'header', 'query', 'path', 'message'], default: 'body' })
  @IsOptional()
  @IsIn(['body', 'header', 'query', 'path', 'message'])
  location?: 'body' | 'header' | 'query' | 'path' | 'message';

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ enum: ['string', 'number', 'decimal', 'boolean', 'raw'], default: 'raw' })
  @IsOptional()
  @IsIn(['string', 'number', 'decimal', 'boolean', 'raw'])
  type?: 'string' | 'number' | 'decimal' | 'boolean' | 'raw';

  @ApiPropertyOptional({ description: 'Used when the source path has no value.' })
  @IsOptional()
  defaultValue?: unknown;

  @ApiPropertyOptional({ description: 'Literal value when source is literalValue.' })
  @IsOptional()
  literalValue?: unknown;
}

export class ResponseMappingDto {
  @ApiPropertyOptional({ example: 'data.status', default: 'status' })
  @IsOptional()
  @IsString()
  decisionPath?: string;

  @ApiPropertyOptional({ type: [String], example: ['APPROVED', 'SUCCESS', 'CONFIRMED'] })
  @IsOptional()
  @IsArray()
  approvedValues?: string[];

  @ApiPropertyOptional({ type: [String], example: ['REJECTED', 'DECLINED', 'FAILED'] })
  @IsOptional()
  @IsArray()
  rejectedValues?: string[];

  @ApiPropertyOptional({ example: 'data.code' })
  @IsOptional()
  @IsString()
  codePath?: string;

  @ApiPropertyOptional({ example: 'message' })
  @IsOptional()
  @IsString()
  messagePath?: string;

  @ApiPropertyOptional({ example: 'data.externalReference' })
  @IsOptional()
  @IsString()
  externalReferencePath?: string;
}

export class IntegrationAuthDto {
  @ApiProperty({ enum: ['NONE', 'LOGIN_BEARER'], default: 'NONE' })
  @IsIn(['NONE', 'LOGIN_BEARER'])
  type: 'NONE' | 'LOGIN_BEARER' = 'NONE';

  @ApiPropertyOptional({ example: 'https://merchant.example.com/auth/login' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  loginUrl?: string;

  @ApiPropertyOptional({ enum: ['POST', 'PUT', 'PATCH'], default: 'POST' })
  @IsOptional()
  @IsIn(['POST', 'PUT', 'PATCH'])
  loginMethod?: 'POST' | 'PUT' | 'PATCH';

  @ApiPropertyOptional({ type: [FieldMappingDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldMappingDto)
  loginMapping?: FieldMappingDto[];

  @ApiPropertyOptional({ example: { 'x-client-id': 'finify' } })
  @IsOptional()
  @IsObject()
  loginHeaders?: Record<string, string>;

  @ApiPropertyOptional({ example: 'data.access_token' })
  @IsOptional()
  @IsString()
  tokenPath?: string;

  @ApiPropertyOptional({ example: 'data.expires_in' })
  @IsOptional()
  @IsString()
  expiresInPath?: string;

  @ApiPropertyOptional({ default: 'Bearer' })
  @IsOptional()
  @IsString()
  tokenPrefix?: string;

  @ApiPropertyOptional({ default: 'Authorization' })
  @IsOptional()
  @IsString()
  finalHeader?: string;

  @ApiPropertyOptional({
    example: { username: 'merchant-user', password: 'merchant-password' },
    description: 'Write-only values encrypted before storage. Omit to preserve existing secrets.',
  })
  @IsOptional()
  @IsObject()
  secrets?: Record<string, string>;
}

export class UpsertMerchantIntegrationDto {
  @ApiProperty({ enum: ['API', 'KAFKA'] })
  @IsIn(['API', 'KAFKA'])
  channel: 'API' | 'KAFKA';

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ example: 'https://merchant.example.com/payments' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  apiUrl?: string;

  @ApiPropertyOptional({ enum: ['POST', 'PUT', 'PATCH'], default: 'POST' })
  @IsOptional()
  @IsIn(['POST', 'PUT', 'PATCH'])
  apiMethod?: 'POST' | 'PUT' | 'PATCH';

  @ApiPropertyOptional({ example: 'merchant.payment.requests' })
  @IsOptional()
  @IsString()
  kafkaTopic?: string;

  @ApiPropertyOptional({ example: 'message.TransactionId' })
  @IsOptional()
  @IsString()
  kafkaMessageKeySource?: string;

  @ApiProperty({ type: [FieldMappingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldMappingDto)
  requestMapping: FieldMappingDto[];

  @ApiPropertyOptional({ type: ResponseMappingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ResponseMappingDto)
  responseMapping?: ResponseMappingDto;

  @ApiPropertyOptional({ type: IntegrationAuthDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IntegrationAuthDto)
  auth?: IntegrationAuthDto;

  @ApiPropertyOptional({ minimum: 1000, maximum: 120000, default: 10000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(120000)
  timeoutMs?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10, default: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @ApiPropertyOptional({ enum: ['API_KEY', 'HMAC', 'NONE'], default: 'API_KEY' })
  @IsOptional()
  @IsIn(['API_KEY', 'HMAC', 'NONE'])
  callbackAuthType?: 'API_KEY' | 'HMAC' | 'NONE';

  @ApiPropertyOptional({ description: 'Write-only callback API key or HMAC secret. Omit to preserve it.' })
  @IsOptional()
  @IsString()
  callbackSecret?: string;

  @ApiPropertyOptional({ example: 'admin@example.com' })
  @IsOptional()
  @IsString()
  changedBy?: string;
}

export class PreviewMappingDto {
  @ApiProperty({ example: { TransactionId: '12345', Amount: '100.00', Source: '447700000001' } })
  @IsObject()
  message: Record<string, unknown>;
}

export class IntegrationStatusDto {
  @ApiProperty()
  @IsBoolean()
  active: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  changedBy?: string;
}

export class MerchantConfirmationDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  correlationId: string;

  @ApiProperty({ example: '12345' })
  @IsString()
  transactionId: string;

  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision: 'APPROVED' | 'REJECTED';

  @ApiProperty({ description: 'Unique identifier for retry-safe callback processing.' })
  @IsString()
  idempotencyKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;
}

export class CreateDisputeDto {
  @ApiProperty()
  @IsString()
  transactionId: string;

  @ApiProperty()
  @IsString()
  disputeReference: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestedBy?: string;
}
