import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const MR_FINIFY_MODEL_IDS = [
  'gpt-5.6-luna',
  'gpt-5.6-terra',
  'gpt-5.6-sol',
] as const;

export type MrFinifyModelId = (typeof MR_FINIFY_MODEL_IDS)[number];

export class MrFinifyMessageDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content: string;
}

export class MrFinifyChatDto {
  @IsString()
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/)
  activeModule?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MrFinifyMessageDto)
  history: MrFinifyMessageDto[] = [];
}

export class UpdateMrFinifyConfigurationDto {
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  @Matches(/^\S+$/, { message: 'API key cannot contain whitespace' })
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  removeApiKey?: boolean;

  @IsString()
  @IsIn([...MR_FINIFY_MODEL_IDS], {
    message: 'Select a supported Mr. Finify model',
  })
  model: MrFinifyModelId;

  @IsInt()
  @Min(1)
  @Max(100)
  rateLimitPerMinute: number;
}
