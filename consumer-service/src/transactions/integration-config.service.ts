import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FieldMappingService } from './field-mapping.service';
import { PreviewMappingDto, UpsertMerchantIntegrationDto } from './integration.dto';
import { IntegrationSecretService } from './integration-secret.service';
import { MerchantIntegrationConfig } from './integration.types';

@Injectable()
export class IntegrationConfigService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly secrets: IntegrationSecretService,
    private readonly mapper: FieldMappingService,
  ) {}

  async get(merchantMsisdn: string): Promise<Record<string, unknown>> {
    const config = await this.getRuntimeConfig(merchantMsisdn, false);
    return this.publicConfig(config);
  }

  async getRuntimeConfig(merchantMsisdn: string, requireActive = true): Promise<MerchantIntegrationConfig> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT c.*, p."Merchant_Type" AS merchant_type, p."Integration_Channel" AS integration_channel,
              a.auth_type, a.login_url, a.login_method, a.login_mapping, a.login_headers,
              a.token_path, a.expires_in_path, a.token_prefix, a.final_header, a.secrets_ciphertext
       FROM public.sw_tbl_merchant_integration_config c
       JOIN public."SW_TBL_PROFILE_MERCHANT" p ON p."MSISDN" = c.merchant_msisdn
       LEFT JOIN public.sw_tbl_merchant_integration_auth a ON a.config_id = c.id
       WHERE c.merchant_msisdn = $1::bigint`,
      [merchantMsisdn],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException(`No integration configuration exists for merchant ${merchantMsisdn}`);
    if (requireActive && row.is_active !== true) throw new BadRequestException(`Merchant ${merchantMsisdn} integration is inactive`);
    if (row.integration_channel !== 'API' && row.integration_channel !== 'KAFKA') {
      throw new BadRequestException(`Merchant ${merchantMsisdn} has no valid Integration_Channel`);
    }
    return this.toRuntimeConfig(row);
  }

  async upsert(merchantMsisdn: string, dto: UpsertMerchantIntegrationDto): Promise<Record<string, unknown>> {
    this.validate(dto);
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const merchantRows = await runner.query(
        `SELECT "MSISDN" FROM public."SW_TBL_PROFILE_MERCHANT" WHERE "MSISDN" = $1::bigint FOR UPDATE`,
        [merchantMsisdn],
      ) as unknown as Array<Record<string, unknown>>;
      if (!merchantRows[0]) throw new NotFoundException(`Merchant ${merchantMsisdn} was not found`);

      const existingRows = await runner.query(
        `SELECT c.*, a.secrets_ciphertext AS auth_secrets_ciphertext
         FROM public.sw_tbl_merchant_integration_config c
         LEFT JOIN public.sw_tbl_merchant_integration_auth a ON a.config_id = c.id
         WHERE c.merchant_msisdn = $1::bigint FOR UPDATE OF c`,
        [merchantMsisdn],
      ) as unknown as Array<Record<string, unknown>>;
      const existing = existingRows[0];
      const version = Number(existing?.version ?? 0) + 1;
      const callbackCiphertext = dto.callbackSecret
        ? this.secrets.encryptString(dto.callbackSecret)
        : (existing?.callback_secret_ciphertext as string | null | undefined) ?? null;
      const authCiphertext = dto.auth?.secrets
        ? this.secrets.encryptObject(dto.auth.secrets)
        : (existing?.auth_secrets_ciphertext as string | null | undefined) ?? null;
      if (dto.channel === 'KAFKA' && dto.active && (dto.callbackAuthType ?? 'API_KEY') !== 'NONE' && !callbackCiphertext) {
        throw new BadRequestException('An active KAFKA integration using API_KEY or HMAC callback authentication requires callbackSecret');
      }

      await runner.query(
        `UPDATE public."SW_TBL_PROFILE_MERCHANT"
         SET "Integration_Channel" = $2, "Modified_Date" = CURRENT_TIMESTAMP,
             "Modified_By" = COALESCE($3, "Modified_By")
         WHERE "MSISDN" = $1::bigint`,
        [merchantMsisdn, dto.channel, dto.changedBy ?? null],
      );

      const configRows = await runner.query(
        `INSERT INTO public.sw_tbl_merchant_integration_config (
           merchant_msisdn, version, is_active, api_url, api_method, kafka_topic,
           kafka_message_key_source, request_mapping, response_mapping, timeout_ms,
           max_retries, callback_auth_type, callback_secret_ciphertext, created_by, updated_by
         ) VALUES ($1::bigint,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$14)
         ON CONFLICT (merchant_msisdn) DO UPDATE SET
           version=EXCLUDED.version,is_active=EXCLUDED.is_active,api_url=EXCLUDED.api_url,
           api_method=EXCLUDED.api_method,kafka_topic=EXCLUDED.kafka_topic,
           kafka_message_key_source=EXCLUDED.kafka_message_key_source,
           request_mapping=EXCLUDED.request_mapping,response_mapping=EXCLUDED.response_mapping,
           timeout_ms=EXCLUDED.timeout_ms,max_retries=EXCLUDED.max_retries,
           callback_auth_type=EXCLUDED.callback_auth_type,
           callback_secret_ciphertext=EXCLUDED.callback_secret_ciphertext,
           updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP
         RETURNING id::text`,
        [merchantMsisdn, version, dto.active ?? false, dto.apiUrl ?? null, dto.apiMethod ?? 'POST',
          dto.kafkaTopic ?? null, dto.kafkaMessageKeySource ?? null, JSON.stringify(dto.requestMapping),
          JSON.stringify(dto.responseMapping ?? {}), dto.timeoutMs ?? 10000, dto.maxRetries ?? 3,
          dto.callbackAuthType ?? 'API_KEY', callbackCiphertext, dto.changedBy ?? null],
      ) as unknown as Array<Record<string, unknown>>;
      const configId = String(configRows[0].id);
      const auth = dto.auth ?? { type: 'NONE' as const };
      await runner.query(
        `INSERT INTO public.sw_tbl_merchant_integration_auth (
           config_id,auth_type,login_url,login_method,login_mapping,login_headers,
           token_path,expires_in_path,token_prefix,final_header,secrets_ciphertext
         ) VALUES ($1::bigint,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)
         ON CONFLICT (config_id) DO UPDATE SET auth_type=EXCLUDED.auth_type,
           login_url=EXCLUDED.login_url,login_method=EXCLUDED.login_method,
           login_mapping=EXCLUDED.login_mapping,login_headers=EXCLUDED.login_headers,
           token_path=EXCLUDED.token_path,expires_in_path=EXCLUDED.expires_in_path,
           token_prefix=EXCLUDED.token_prefix,final_header=EXCLUDED.final_header,
           secrets_ciphertext=EXCLUDED.secrets_ciphertext,updated_at=CURRENT_TIMESTAMP`,
        [configId, auth.type, auth.loginUrl ?? null, auth.loginMethod ?? 'POST',
          JSON.stringify(auth.loginMapping ?? []), JSON.stringify(auth.loginHeaders ?? {}),
          auth.tokenPath ?? null, auth.expiresInPath ?? null, auth.tokenPrefix ?? 'Bearer',
          auth.finalHeader ?? 'Authorization', authCiphertext],
      );

      const historySnapshot = this.historySnapshot(dto, Boolean(callbackCiphertext), Boolean(authCiphertext));
      await runner.query(
        `INSERT INTO public.sw_tbl_merchant_integration_config_history
         (config_id,merchant_msisdn,version,integration_channel,configuration,changed_by)
         VALUES ($1::bigint,$2::bigint,$3,$4,$5::jsonb,$6)`,
        [configId, merchantMsisdn, version, dto.channel, JSON.stringify(historySnapshot), dto.changedBy ?? null],
      );
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
    return this.get(merchantMsisdn);
  }

  async setActive(merchantMsisdn: string, active: boolean, changedBy?: string): Promise<Record<string, unknown>> {
    const result = await this.dataSource.query<Array<Record<string, unknown>>>(
      `UPDATE public.sw_tbl_merchant_integration_config
       SET is_active=$2,updated_by=$3,updated_at=CURRENT_TIMESTAMP
       WHERE merchant_msisdn=$1::bigint RETURNING id`,
      [merchantMsisdn, active, changedBy ?? null],
    );
    if (!result[0]) throw new NotFoundException(`No integration configuration exists for merchant ${merchantMsisdn}`);
    return this.get(merchantMsisdn);
  }

  async preview(merchantMsisdn: string, dto: PreviewMappingDto): Promise<Record<string, unknown>> {
    const config = await this.getRuntimeConfig(merchantMsisdn, false);
    const mapped = this.mapper.map(config.requestMapping, {
      message: dto.message,
      transaction: {},
      system: { correlationId: 'preview-correlation-id', callbackUrl: '/v1/merchant-confirmations' },
      secret: {},
    });
    return { ...mapped };
  }

  async history(merchantMsisdn: string): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT version,integration_channel,configuration,changed_by,changed_at
       FROM public.sw_tbl_merchant_integration_config_history
       WHERE merchant_msisdn=$1::bigint ORDER BY version DESC`,
      [merchantMsisdn],
    );
  }

  async attempts(merchantMsisdn: string, limit = 50): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT transactionid,correlation_id,integration_channel,confirmation_status,posting_status,
              attempt_count,http_status,response_code,response_message,external_reference,created_at,updated_at
       FROM public.sw_tbl_merchant_integration_attempt
       WHERE merchant_msisdn=$1::bigint ORDER BY created_at DESC LIMIT $2`,
      [merchantMsisdn, Math.min(Math.max(limit, 1), 200)],
    );
  }

  sourceFields(): Record<string, string[]> {
    return {
      message: ['TransactionId','Source','Destination','Amount','Serice','CHARGEAMOUNT','CHARGEWALLET','CHARGEWALLETCREDIT','COMMISSIONAMOUNT','COMMISSIONWALLET','COMMISSIONWALLETDEBIT','SOURCECOMMISSIONCREDIT','DESTINATIONCOMMISSIONCREDIT','SourceDebitAmount','DestinationCreditAmount','TRNSID','referenceId'],
      transaction: ['transactionId','sourceWalletId','destinationWalletId','amount','keyword','referenceId','currency','trnId'],
      system: ['correlationId','idempotencyKey','callbackUrl','configurationVersion'],
      secret: ['User-defined keys configured in auth.secrets'],
    };
  }

  private validate(dto: UpsertMerchantIntegrationDto): void {
    if (dto.channel === 'API' && !dto.apiUrl) throw new BadRequestException('apiUrl is required for API integrations');
    if (dto.channel === 'KAFKA' && !dto.kafkaTopic) throw new BadRequestException('kafkaTopic is required for KAFKA integrations');
    if (dto.auth?.type === 'LOGIN_BEARER' && (!dto.auth.loginUrl || !dto.auth.tokenPath)) {
      throw new BadRequestException('LOGIN_BEARER requires loginUrl and tokenPath');
    }
  }

  private toRuntimeConfig(row: Record<string, unknown>): MerchantIntegrationConfig {
    return {
      id: String(row.id), merchantMsisdn: String(row.merchant_msisdn),
      merchantType: row.merchant_type === null ? null : String(row.merchant_type),
      channel: String(row.integration_channel) as 'API' | 'KAFKA', version: Number(row.version),
      active: row.is_active === true, apiUrl: row.api_url === null ? null : String(row.api_url),
      apiMethod: String(row.api_method) as 'POST' | 'PUT' | 'PATCH',
      kafkaTopic: row.kafka_topic === null ? null : String(row.kafka_topic),
      kafkaMessageKeySource: row.kafka_message_key_source === null ? null : String(row.kafka_message_key_source),
      requestMapping: row.request_mapping as MerchantIntegrationConfig['requestMapping'],
      responseMapping: row.response_mapping as MerchantIntegrationConfig['responseMapping'],
      timeoutMs: Number(row.timeout_ms), maxRetries: Number(row.max_retries),
      callbackAuthType: String(row.callback_auth_type) as MerchantIntegrationConfig['callbackAuthType'],
      callbackSecretCiphertext: row.callback_secret_ciphertext === null ? null : String(row.callback_secret_ciphertext),
      auth: {
        type: String(row.auth_type ?? 'NONE') as 'NONE' | 'LOGIN_BEARER',
        loginUrl: row.login_url === null || row.login_url === undefined ? null : String(row.login_url),
        loginMethod: String(row.login_method ?? 'POST') as 'POST' | 'PUT' | 'PATCH',
        loginMapping: (row.login_mapping ?? []) as MerchantIntegrationConfig['auth']['loginMapping'],
        loginHeaders: (row.login_headers ?? {}) as Record<string, string>,
        tokenPath: row.token_path === null || row.token_path === undefined ? null : String(row.token_path),
        expiresInPath: row.expires_in_path === null || row.expires_in_path === undefined ? null : String(row.expires_in_path),
        tokenPrefix: String(row.token_prefix ?? 'Bearer'), finalHeader: String(row.final_header ?? 'Authorization'),
        secretsCiphertext: row.secrets_ciphertext === null || row.secrets_ciphertext === undefined ? null : String(row.secrets_ciphertext),
      },
    };
  }

  private publicConfig(config: MerchantIntegrationConfig): Record<string, unknown> {
    return { ...config, callbackSecretCiphertext: undefined, hasCallbackSecret: Boolean(config.callbackSecretCiphertext),
      auth: { ...config.auth, secretsCiphertext: undefined, hasSecrets: Boolean(config.auth.secretsCiphertext) } };
  }

  private historySnapshot(dto: UpsertMerchantIntegrationDto, hasCallbackSecret: boolean, hasAuthSecrets: boolean): Record<string, unknown> {
    return { ...dto, callbackSecret: undefined, hasCallbackSecret,
      auth: dto.auth ? { ...dto.auth, secrets: undefined, hasSecrets: hasAuthSecrets } : { type: 'NONE', hasSecrets: false } };
  }
}
