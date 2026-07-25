import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MerchantConfirmationDto } from './integration.dto';
import { IntegrationSecretService } from './integration-secret.service';
import { AmlSummaryService } from './aml-summary.service';

@Injectable()
export class MerchantConfirmationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly secrets: IntegrationSecretService,
    private readonly amlSummary: AmlSummaryService,
  ) {}

  async confirm(dto: MerchantConfirmationDto, headers: Record<string, string | undefined>, rawBody: string): Promise<Record<string, unknown>> {
    const attempts = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT a.*,c.callback_auth_type,c.callback_secret_ciphertext
       FROM public.sw_tbl_merchant_integration_attempt a
       JOIN public.sw_tbl_merchant_integration_config c ON c.id=a.config_id
       WHERE a.correlation_id=$1::uuid`, [dto.correlationId],
    );
    const attempt = attempts[0];
    if (!attempt) throw new NotFoundException('Unknown merchant confirmation correlationId');
    if (String(attempt.transactionid) !== dto.transactionId) throw new ConflictException('transactionId does not match correlationId');
    if (String(attempt.idempotency_key) !== dto.idempotencyKey) throw new ConflictException('idempotencyKey does not match correlationId');
    this.authorize(attempt, headers, rawBody);

    const existingRows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT * FROM public.sw_tbl_merchant_confirmation WHERE correlation_id=$1::uuid`, [dto.correlationId],
    );
    const existing = existingRows[0];
    let confirmation: Record<string, unknown>;
    if (existing) {
      if (existing.decision !== dto.decision) throw new ConflictException('A contradictory decision was already processed');
      const processingStatus = String(existing.processing_status ?? 'PENDING');
      if (processingStatus === 'COMPLETED' || processingStatus === 'REVERSED') {
        await this.amlSummary.finalize(
          dto.transactionId,
          processingStatus === 'COMPLETED' ? 'COMPLETED' : 'RELEASED',
        );
        return this.confirmationResult(existing, true);
      }
      // A previous callback may have stopped after accounting but before AML
      // finalization. Re-run the idempotent posting function and finish the flow.
      confirmation = existing;
    } else {
      const insertRows = await this.dataSource.query<Array<Record<string, unknown>>>(
        `INSERT INTO public.sw_tbl_merchant_confirmation (
           correlation_id,transactionid,merchant_msisdn,config_version,decision,
           external_reference,reason_code,message,idempotency_key,request_payload
         ) VALUES ($1::uuid,$2::bigint,$3::bigint,$4,$5,$6,$7,$8,$9,$10::jsonb)
         RETURNING *`,
        [dto.correlationId,dto.transactionId,attempt.merchant_msisdn,attempt.config_version,dto.decision,
          dto.externalReference ?? null,dto.reasonCode ?? null,dto.message ?? null,dto.idempotencyKey,JSON.stringify(dto)],
      );
      confirmation = insertRows[0];
    }
    const payload = typeof attempt.request_payload === 'object' && attempt.request_payload !== null
      ? attempt.request_payload as Record<string, unknown> : {};
    const action = dto.decision === 'APPROVED' ? 'POST' : 'REVERSE';
    const leg = dto.decision === 'APPROVED' ? 2 : null;
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT * FROM public.sw_proc_direct_finify_transaction($1::jsonb,'TWO_LEG'::varchar,$2::varchar,$3::smallint)`,
      [JSON.stringify({ ...payload, TransactionId: dto.transactionId, TransactionAction: action,
        ExternalReference: dto.externalReference, ConfirmationCorrelationId: dto.correlationId }), action, leg],
    );
    const posting = rows[0];
    const successful = posting?.success === true;
    const processingStatus = successful
      ? dto.decision === 'APPROVED' ? 'COMPLETED' : 'REVERSED'
      : String(posting?.status_code) === 'REVERSAL_BLOCKED' ? 'BLOCKED' : 'FAILED';
    await this.dataSource.query(
      `UPDATE public.sw_tbl_merchant_confirmation SET processing_status=$2::varchar,result_payload=$3::jsonb,
         settlement_journal_id=CASE WHEN $4::varchar='APPROVED' THEN $5::bigint ELSE NULL END,
         reversal_journal_id=CASE WHEN $4::varchar='REJECTED' THEN $5::bigint ELSE NULL END,
         processed_at=CURRENT_TIMESTAMP WHERE id=$1::bigint`,
      [confirmation.id,processingStatus,JSON.stringify(posting ?? {}),dto.decision,posting?.result_journal_id ?? null],
    );
    await this.dataSource.query(
      `UPDATE public.sw_tbl_merchant_integration_attempt SET confirmation_status=$2::varchar,
         posting_status=$3::varchar,external_reference=$4,response_payload=$5::jsonb,updated_at=CURRENT_TIMESTAMP
       WHERE correlation_id=$1::uuid`,
      [dto.correlationId,dto.decision,processingStatus === 'COMPLETED' ? 'COMPLETED' : processingStatus === 'REVERSED' ? 'REVERSED' : 'BLOCKED',
        dto.externalReference ?? null,JSON.stringify(dto)],
    );
    if (successful) {
      await this.amlSummary.finalize(dto.transactionId, dto.decision === 'APPROVED' ? 'COMPLETED' : 'RELEASED');
    }
    return { correlationId: dto.correlationId, transactionId: dto.transactionId, decision: dto.decision,
      processingStatus, postingResult: posting, idempotent: false };
  }

  async status(correlationId: string): Promise<Record<string, unknown>> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT correlation_id,transactionid,decision,external_reference,processing_status,result_payload,received_at,processed_at
       FROM public.sw_tbl_merchant_confirmation WHERE correlation_id=$1::uuid`, [correlationId],
    );
    if (!rows[0]) throw new NotFoundException('Confirmation was not found');
    return this.confirmationResult(rows[0], true);
  }

  private authorize(attempt: Record<string, unknown>, headers: Record<string, string | undefined>, rawBody: string): void {
    const type = String(attempt.callback_auth_type);
    const encrypted = attempt.callback_secret_ciphertext === null ? null : String(attempt.callback_secret_ciphertext);
    if (type === 'NONE') return;
    if (type === 'API_KEY' && this.secrets.verifyApiKey(headers['x-integration-key'], encrypted)) return;
    if (type === 'HMAC' && this.secrets.verifyHmac(rawBody, headers['x-finify-signature'], encrypted)) return;
    throw new UnauthorizedException('Merchant confirmation authentication failed');
  }

  private confirmationResult(row: Record<string, unknown>, idempotent: boolean): Record<string, unknown> {
    return { correlationId: row.correlation_id,transactionId: row.transactionid,decision: row.decision,
      externalReference: row.external_reference,processingStatus: row.processing_status,
      result: row.result_payload,receivedAt: row.received_at,processedAt: row.processed_at,idempotent };
  }
}
