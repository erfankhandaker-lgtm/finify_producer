import { FieldMappingDto, ResponseMappingDto } from './integration.dto';

export interface MerchantIntegrationConfig {
  id: string;
  merchantMsisdn: string;
  merchantType: string | null;
  channel: 'API' | 'KAFKA';
  version: number;
  active: boolean;
  apiUrl: string | null;
  apiMethod: 'POST' | 'PUT' | 'PATCH';
  kafkaTopic: string | null;
  kafkaMessageKeySource: string | null;
  requestMapping: FieldMappingDto[];
  responseMapping: ResponseMappingDto;
  timeoutMs: number;
  maxRetries: number;
  callbackAuthType: 'API_KEY' | 'HMAC' | 'NONE';
  callbackSecretCiphertext: string | null;
  auth: {
    type: 'NONE' | 'LOGIN_BEARER';
    loginUrl: string | null;
    loginMethod: 'POST' | 'PUT' | 'PATCH';
    loginMapping: FieldMappingDto[];
    loginHeaders: Record<string, string>;
    tokenPath: string | null;
    expiresInPath: string | null;
    tokenPrefix: string;
    finalHeader: string;
    secretsCiphertext: string | null;
  };
}

export interface MappingContext {
  message: Record<string, unknown>;
  transaction: Record<string, unknown>;
  system: Record<string, unknown>;
  secret: Record<string, unknown>;
}

export interface MappedRequest {
  body: Record<string, unknown>;
  headers: Record<string, string>;
  query: Record<string, string>;
  path: Record<string, string>;
}
