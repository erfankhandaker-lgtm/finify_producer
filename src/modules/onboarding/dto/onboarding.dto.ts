import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO31661Alpha3,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { JourneyNodeType } from '../onboarding.types';

const nodeTypes: JourneyNodeType[] = [
  'START','END','PHONE_CAPTURE','OTP_VERIFICATION','PIN_SETUP','CONSENT','FORM',
  'KYC','WALLET_ALLOCATION','CREDIT_SCORE','CREDIT_POLICY','LIMIT_ALLOCATION',
  'DECISION','CHANNEL_HANDOFF','MANUAL_REVIEW',
];

export class CreateJourneyDto {
  @IsUUID() tenantId: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,63}$/) code: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class CreateJourneyVersionDto {
  @IsOptional() @IsString() @MaxLength(2000) changeSummary?: string;
  @IsOptional() @IsUUID() cloneFromVersionId?: string;
}

export class JourneyScopeDto {
  @IsISO31661Alpha3() countryCode: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,39}$/) channelCode: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,31}$/) customerType: string;
  @IsInt() @Min(1) @Max(10000) priority: number;
  @IsOptional() @IsISO8601() effectiveFrom?: string;
  @IsOptional() @IsISO8601() effectiveTo?: string;
}

export class JourneyNodePositionDto {
  @Type(() => Number) x: number;
  @Type(() => Number) y: number;
}

export class JourneyNodeDto {
  @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/) key: string;
  @IsIn(nodeTypes) type: JourneyNodeType;
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsObject() configuration: Record<string, unknown>;
  @ValidateNested() @Type(() => JourneyNodePositionDto) position: JourneyNodePositionDto;
  @IsOptional() @IsBoolean() entry?: boolean;
}

export class JourneyTransitionDto {
  @IsString() @IsNotEmpty() from: string;
  @IsString() @IsNotEmpty() to: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{0,63}$/) outcome: string;
  @IsInt() @Min(1) @Max(10000) priority: number;
  @IsOptional() @IsObject() condition?: Record<string, unknown>;
}

export class ReplaceJourneyGraphDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => JourneyScopeDto)
  scopes: JourneyScopeDto[];
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => JourneyNodeDto)
  nodes: JourneyNodeDto[];
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => JourneyTransitionDto)
  transitions: JourneyTransitionDto[];
}

export class SimulateJourneyDto {
  @IsOptional() @IsObject() outcomes?: Record<string, string>;
}

export class JourneyReviewDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class StartJourneyDto {
  @IsUUID() tenantId: string;
  @IsISO31661Alpha3() countryCode: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,39}$/) channelCode: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,31}$/) customerType: string;
  @IsString() @Matches(/^\+[1-9]\d{7,14}$/) phoneNumber: string;
}

export class AdvanceJourneyStepDto {
  @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/) nodeKey: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{0,63}$/) outcome: string;
  @IsOptional() @IsObject() output?: Record<string, unknown>;
}
