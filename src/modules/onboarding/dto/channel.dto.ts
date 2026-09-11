import { Type } from 'class-transformer';
import {
  ArrayMinSize,IsArray,IsIn,IsInt,IsISO31661Alpha3,IsISO8601,IsNotEmpty,IsObject,IsOptional,
  IsString,IsUUID,Matches,Max,MaxLength,Min,ValidateNested,
} from 'class-validator';
import { JourneyNodeType } from '../onboarding.types';

const executionModes=['DIRECT','HANDOFF_ONLY','SERVER_ONLY','UNSUPPORTED'] as const;
const authenticationModes=['PUBLIC_PREAUTH','APP_ATTESTATION','OAUTH2_CLIENT','MTLS','SIGNED_WEBHOOK','AGENT_SESSION'] as const;

export class ChannelCountryDto {
  @IsISO31661Alpha3() countryCode: string;
  @IsOptional() @IsObject() configuration?: Record<string,unknown>;
}

export class ChannelCapabilityDto {
  @IsString() @IsNotEmpty() nodeType: JourneyNodeType;
  @IsIn(executionModes) executionMode: typeof executionModes[number];
  @IsOptional() @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/) componentKey?: string;
  @IsOptional() @IsObject() configuration?: Record<string,unknown>;
}

export class CreateChannelDto {
  @IsUUID() tenantId: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,39}$/) code: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsIn(authenticationModes) authenticationMode: typeof authenticationModes[number];
  @IsInt() @Min(60) @Max(86400) sessionTimeoutSeconds: number;
  @IsInt() @Min(300) @Max(2592000) resumeTimeoutSeconds: number;
  @IsOptional() @IsObject() configuration?: Record<string,unknown>;
  @IsArray() @ArrayMinSize(1) @ValidateNested({each:true}) @Type(()=>ChannelCountryDto)
  countries: ChannelCountryDto[];
  @IsArray() @ArrayMinSize(1) @ValidateNested({each:true}) @Type(()=>ChannelCapabilityDto)
  capabilities: ChannelCapabilityDto[];
}

export class CreateChannelVersionDto {
  @IsOptional() @IsUUID() cloneFromVersionId?: string;
  @IsOptional() @IsString() @MaxLength(2000) changeSummary?: string;
}

export class ReplaceChannelVersionDto {
  @IsIn(authenticationModes) authenticationMode: typeof authenticationModes[number];
  @IsInt() @Min(60) @Max(86400) sessionTimeoutSeconds: number;
  @IsInt() @Min(300) @Max(2592000) resumeTimeoutSeconds: number;
  @IsObject() configuration: Record<string,unknown>;
  @IsArray() @ArrayMinSize(1) @ValidateNested({each:true}) @Type(()=>ChannelCountryDto)
  countries: ChannelCountryDto[];
  @IsArray() @ArrayMinSize(1) @ValidateNested({each:true}) @Type(()=>ChannelCapabilityDto)
  capabilities: ChannelCapabilityDto[];
}

export class ChannelReviewDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class CreateChannelClientDto {
  @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_.-]{2,99}$/) clientId: string;
  @IsIn(authenticationModes) authenticationMode: typeof authenticationModes[number];
  @IsOptional() @IsString() @MaxLength(300) credentialReference?: string;
  @IsOptional() @IsISO8601() expiresAt?: string;
}

export class CreateChannelHandoffDto {
  @IsOptional() @IsInt() @Min(60) @Max(1800) expiresInSeconds?: number;
}

export class ConsumeChannelHandoffDto {
  @IsString() @IsNotEmpty() @MaxLength(300) handoffToken: string;
}
