import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { IntegrationConfigService } from './integration-config.service';
import { MerchantDispatchService, MerchantDispatchResult } from './merchant-dispatch.service';
import { MerchantConfirmationDecision } from './merchant-confirmation';
import { TransactionRequest } from './transaction-request.entity';
import { AmlSummaryService } from './aml-summary.service';

export interface KafkaMessageMetadata {
  topic: string;
  partition: number;
  offset: string;
}

type TransactionMessage = Record<string, unknown>;
type TransactionMode = 'DIRECT' | 'TWO_LEG';

interface MerchantProfile {
  msisdn: string;
  merchantType: string | null;
  isSpecial: boolean;
  integrationChannel: 'API' | 'KAFKA' | null;
}

interface MerchantAttempt {
  confirmationStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNKNOWN';
  postingStatus: 'RESERVED' | 'COMPLETED' | 'REVERSED' | 'BLOCKED';
  correlationId: string | null;
  integrationChannel: 'API' | 'KAFKA' | null;
}

interface PostingResult {
  success: boolean;
  statusCode: string;
  statusMessage: string;
  transactionId: string;
  mode: TransactionMode;
  action: 'POST' | 'REVERSE';
  leg: number;
  journalId: string | null;
}

const DISPUTE_ACTIONS = new Set(['REVERSE', 'REVERSAL', 'DISPUTE_REVERSE', 'REVERSE_TRANSFER']);
const RETRYABLE_POSTING_STATUSES = new Set([
  'OPERATION_IN_PROGRESS',
  'WALLET_NOT_AVAILABLE',
  'SETTLEMENT_BLOCKED',
  'REVERSAL_BLOCKED',
]);

@Injectable()
export class TransactionReaderService {
  private readonly logger = new Logger(TransactionReaderService.name);
  private readonly specialMerchantTypes: Set<string>;

  constructor(
    @InjectRepository(TransactionRequest)
    private readonly transactions: Repository<TransactionRequest>,
    private readonly dataSource: DataSource,
    private readonly integrationConfigs: IntegrationConfigService,
    private readonly merchantDispatch: MerchantDispatchService,
    private readonly amlSummary: AmlSummaryService,
    config: ConfigService,
  ) {
    this.specialMerchantTypes = new Set(
      config.get<string>('SPECIAL_MERCHANT_TYPES', 'SPECIAL,EXTERNAL')
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    );
  }

  async read(message: unknown, metadata: KafkaMessageMetadata): Promise<void> {
    if (!this.isObject(message)) {
      this.logger.warn(`Ignored non-object message from ${this.location(metadata)}`);
      return;
    }

    const transactionId = this.readTransactionId(message);
    if (!transactionId) {
      this.logger.warn(`Message has no TransactionId at ${this.location(metadata)}`);
      return;
    }

    const transaction = await this.transactions.findOne({ where: { transactionId } });
    if (!transaction) {
      this.logger.warn(`Transaction ${transactionId} was received but not found in PostgreSQL`);
      return;
    }

    const action = this.readString(message, ['TransactionAction', 'transactionAction', 'action'])
      ?.trim().toUpperCase() ?? 'POST';

    if (DISPUTE_ACTIONS.has(action)) {
      await this.processDisputeReversal(message, transaction);
      return;
    }

    if (!transaction.destinationWalletId) {
      this.logger.error(`Transaction ${transactionId} has no destination wallet`);
      return;
    }

    const merchant = await this.findMerchant(transaction.destinationWalletId);
    if (merchant && this.isSpecialMerchant(merchant)) {
      await this.processSpecialMerchant(message, transaction, merchant);
      return;
    }

    await this.processDirect(message, transaction);
  }

  async submitDispute(input: {
    transactionId: string;
    disputeReference: string;
    reason?: string;
    requestedBy?: string;
  }): Promise<Record<string, unknown>> {
    const transaction = await this.transactions.findOne({ where: { transactionId: input.transactionId } });
    if (!transaction) throw new NotFoundException(`Transaction ${input.transactionId} was not found`);
    await this.processDisputeReversal({
      TransactionId: input.transactionId,
      TransactionAction: 'DISPUTE_REVERSE',
      DisputeReference: input.disputeReference,
      DisputeReason: input.reason,
      RequestedBy: input.requestedBy,
    }, transaction);
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT id::text,transactionid,dispute_reference,status,reason,requested_by,
              reversal_journal_id::text,last_error,created_at,updated_at,completed_at
       FROM public.sw_tbl_transaction_dispute
       WHERE transactionid=$1::bigint AND dispute_reference=$2`,
      [input.transactionId, input.disputeReference],
    );
    return rows[0];
  }

  private async processDirect(message: TransactionMessage, transaction: TransactionRequest): Promise<void> {
    const result = await this.post(message, 'DIRECT', 'POST', 1);
    if (!this.acceptPostingResult(result, ['COMPLETED', 'ALREADY_COMPLETED'])) {
      if (!RETRYABLE_POSTING_STATUSES.has(result.statusCode)) {
        await this.amlSummary.finalize(transaction.transactionId, 'RELEASED');
      }
      this.handlePostingFailure(result, `direct transaction ${transaction.transactionId}`);
      return;
    }

    await this.amlSummary.finalize(transaction.transactionId, 'COMPLETED');
    this.logger.log(`Completed direct transaction ${transaction.transactionId} (journal=${result.journalId ?? 'existing'})`);
  }

  private async processSpecialMerchant(
    message: TransactionMessage,
    transaction: TransactionRequest,
    merchant: MerchantProfile,
  ): Promise<void> {
    const integration = await this.integrationConfigs.getRuntimeConfig(merchant.msisdn);
    const reserve = await this.post(message, 'TWO_LEG', 'POST', 1);
    if (!this.acceptPostingResult(reserve, ['RESERVED', 'ALREADY_RESERVED', 'ALREADY_COMPLETED'])) {
      if (!RETRYABLE_POSTING_STATUSES.has(reserve.statusCode)) {
        await this.amlSummary.finalize(transaction.transactionId, 'RELEASED');
      }
      this.handlePostingFailure(reserve, `special-merchant reservation ${transaction.transactionId}`);
      return;
    }
    if (reserve.statusCode === 'ALREADY_COMPLETED') {
      await this.amlSummary.finalize(transaction.transactionId, 'COMPLETED');
      this.logger.log(`Special transaction ${transaction.transactionId} was already settled`);
      return;
    }

    const existingAttempt = await this.findMerchantAttempt(transaction.transactionId);
    if (existingAttempt?.confirmationStatus === 'APPROVED') {
      await this.settleSpecialTransaction(message, transaction.transactionId);
      return;
    }
    if (existingAttempt?.confirmationStatus === 'REJECTED') {
      await this.reverseRejectedSpecialTransaction(message, transaction.transactionId);
      return;
    }

    const idempotencyKey = `finify-merchant-${transaction.transactionId}`;
    const correlationId = existingAttempt?.correlationId ?? randomUUID();
    await this.markMerchantAttemptPending(
      transaction,
      merchant,
      integration.id,
      integration.version,
      integration.channel,
      integration.apiUrl,
      correlationId,
      idempotencyKey,
      message,
    );

    let merchantResult: MerchantDispatchResult;
    try {
      merchantResult = await this.merchantDispatch.dispatch(
        integration,
        message,
        this.mappingTransaction(transaction),
        correlationId,
        idempotencyKey,
      );
    } catch (error) {
      const errorMessage = this.errorMessage(error);
      await this.saveMerchantAttemptDecision(
        transaction.transactionId,
        'UNKNOWN',
        null,
        null,
        integration.channel,
        undefined,
        undefined,
        errorMessage,
      );
      throw new Error(`Merchant confirmation is unknown for transaction ${transaction.transactionId}: ${errorMessage}`);
    }

    await this.saveMerchantAttemptDecision(
      transaction.transactionId,
      merchantResult.decision,
      merchantResult.httpStatus ?? null,
      merchantResult.body ?? null,
      merchantResult.channel,
      merchantResult.code,
      merchantResult.message,
      merchantResult.decision === 'UNKNOWN' ? merchantResult.message : undefined,
      merchantResult.externalReference,
      merchantResult.topic,
    );

    if (merchantResult.decision === 'PENDING') {
      this.logger.log(`Published special transaction ${transaction.transactionId} to ${merchantResult.topic}; funds remain reserved pending callback`);
      return;
    }
    if (merchantResult.decision === 'APPROVED') {
      await this.settleSpecialTransaction(message, transaction.transactionId);
      return;
    }
    if (merchantResult.decision === 'REJECTED') {
      await this.reverseRejectedSpecialTransaction(message, transaction.transactionId);
      return;
    }

    throw new Error(`Merchant response is ambiguous for transaction ${transaction.transactionId}; funds remain reserved`);
  }

  private async settleSpecialTransaction(message: TransactionMessage, transactionId: string): Promise<void> {
    const result = await this.post(message, 'TWO_LEG', 'POST', 2);
    if (!this.acceptPostingResult(result, ['COMPLETED', 'ALREADY_COMPLETED'])) {
      await this.updateMerchantPostingStatus(transactionId, 'BLOCKED', result.statusMessage);
      this.handlePostingFailure(result, `special-merchant settlement ${transactionId}`);
      return;
    }

    await this.updateMerchantPostingStatus(transactionId, 'COMPLETED');
    await this.amlSummary.finalize(transactionId, 'COMPLETED');
    this.logger.log(`Settled special-merchant transaction ${transactionId} (journal=${result.journalId ?? 'existing'})`);
  }

  private async reverseRejectedSpecialTransaction(message: TransactionMessage, transactionId: string): Promise<void> {
    const reversalPayload = {
      ...message,
      TransactionId: transactionId,
      TransactionAction: 'REVERSE',
      ReversalReason: 'MERCHANT_REJECTED',
    };
    const result = await this.post(reversalPayload, 'TWO_LEG', 'REVERSE', null);
    if (!this.acceptPostingResult(result, ['REVERSED', 'ALREADY_REVERSED'])) {
      await this.updateMerchantPostingStatus(transactionId, 'BLOCKED', result.statusMessage);
      this.handlePostingFailure(result, `special-merchant rejection reversal ${transactionId}`);
      return;
    }

    await this.updateMerchantPostingStatus(transactionId, 'REVERSED');
    await this.amlSummary.finalize(transactionId, 'RELEASED');
    this.logger.log(`Reversed rejected special-merchant transaction ${transactionId}`);
  }

  private async processDisputeReversal(
    message: TransactionMessage,
    transaction: TransactionRequest,
  ): Promise<void> {
    const disputeReference = this.readString(message, ['DisputeId', 'DisputeReference', 'disputeId'])
      ?? `DISPUTE-${transaction.transactionId}`;
    const reason = this.readString(message, ['DisputeReason', 'ReversalReason', 'reason']);
    const requestedBy = this.readString(message, ['RequestedBy', 'requestedBy']);

    const dispute = await this.upsertDispute(
      transaction.transactionId,
      disputeReference,
      reason,
      requestedBy,
      message,
    );
    if (dispute.status === 'REVERSED') {
      await this.updateMerchantPostingStatus(transaction.transactionId, 'REVERSED');
      await this.amlSummary.finalize(transaction.transactionId, 'REVERSED');
      this.logger.log(`Dispute ${disputeReference} was already reversed`);
      return;
    }

    const mode = await this.findPostedMode(transaction.transactionId);
    if (!mode) {
      await this.updateDispute(dispute.id, 'FAILED', null, null, 'Original accounting journal not found');
      this.logger.error(`Cannot reverse dispute ${disputeReference}: original journal not found`);
      return;
    }

    const reversalPayload = {
      ...message,
      TransactionId: transaction.transactionId,
      TransactionAction: 'REVERSE',
      DisputeReference: disputeReference,
      DisputeReason: reason,
      RequestedBy: requestedBy,
    };
    const result = await this.post(reversalPayload, mode, 'REVERSE', null);

    if (this.acceptPostingResult(result, ['REVERSED', 'ALREADY_REVERSED'])) {
      await this.updateDispute(dispute.id, 'REVERSED', result.journalId, result, null);
      await this.updateMerchantPostingStatus(transaction.transactionId, 'REVERSED');
      await this.amlSummary.finalize(transaction.transactionId, 'REVERSED');
      this.logger.log(`Completed dispute reversal ${disputeReference} for transaction ${transaction.transactionId}`);
      return;
    }

    const disputeStatus = result.statusCode === 'REVERSAL_BLOCKED' ? 'BLOCKED' : 'FAILED';
    await this.updateDispute(dispute.id, disputeStatus, result.journalId, result, result.statusMessage);
    this.logger.error(`Dispute reversal ${disputeReference} failed: ${result.statusCode} ${result.statusMessage}`);
  }

  private async post(
    message: TransactionMessage,
    mode: TransactionMode,
    action: 'POST' | 'REVERSE',
    leg: number | null,
  ): Promise<PostingResult> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT * FROM public.sw_proc_direct_finify_transaction($1::jsonb, $2::varchar, $3::varchar, $4::smallint)`,
      [JSON.stringify(message), mode, action, leg],
    );
    const row = rows[0];
    if (!row) {
      throw new Error('Transaction posting function returned no result');
    }

    return {
      success: row.success === true,
      statusCode: String(row.status_code ?? 'UNKNOWN'),
      statusMessage: String(row.status_message ?? ''),
      transactionId: String(row.result_transaction_id ?? ''),
      mode: String(row.transaction_mode ?? mode) as TransactionMode,
      action: String(row.transaction_action ?? action) as 'POST' | 'REVERSE',
      leg: Number(row.transaction_leg ?? leg ?? 0),
      journalId: row.result_journal_id === null || row.result_journal_id === undefined
        ? null
        : String(row.result_journal_id),
    };
  }

  private async findMerchant(msisdn: string): Promise<MerchantProfile | null> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT
         "MSISDN"::text AS msisdn,
         "Merchant_Type" AS merchant_type,
         COALESCE("Is_Special_Merchant", false) AS is_special,
         "Integration_Channel" AS integration_channel
       FROM public."SW_TBL_PROFILE_MERCHANT"
       WHERE "MSISDN" = $1::bigint
       LIMIT 1`,
      [msisdn],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      msisdn: String(row.msisdn),
      merchantType: row.merchant_type === null ? null : String(row.merchant_type),
      isSpecial: row.is_special === true,
      integrationChannel: row.integration_channel === 'API' || row.integration_channel === 'KAFKA'
        ? row.integration_channel : null,
    };
  }

  private isSpecialMerchant(merchant: MerchantProfile): boolean {
    return merchant.isSpecial
      || this.specialMerchantTypes.has(merchant.merchantType?.trim().toUpperCase() ?? '');
  }

  private async findMerchantAttempt(transactionId: string): Promise<MerchantAttempt | null> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT confirmation_status, posting_status, correlation_id, integration_channel
       FROM public.sw_tbl_merchant_integration_attempt
       WHERE transactionid = $1::bigint`,
      [transactionId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      confirmationStatus: String(row.confirmation_status) as MerchantAttempt['confirmationStatus'],
      postingStatus: String(row.posting_status) as MerchantAttempt['postingStatus'],
      correlationId: row.correlation_id === null ? null : String(row.correlation_id),
      integrationChannel: row.integration_channel === 'API' || row.integration_channel === 'KAFKA'
        ? row.integration_channel : null,
    };
  }

  private async markMerchantAttemptPending(
    transaction: TransactionRequest,
    merchant: MerchantProfile,
    configId: string,
    configVersion: number,
    channel: 'API' | 'KAFKA',
    serviceUrl: string | null,
    correlationId: string,
    idempotencyKey: string,
    message: TransactionMessage,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO public.sw_tbl_merchant_integration_attempt (
         transactionid, merchant_msisdn, merchant_type, service_url, config_id,
         config_version, integration_channel, correlation_id,
         idempotency_key, confirmation_status, posting_status, attempt_count,
         request_payload, updated_at
       ) VALUES ($1::bigint, $2::bigint, $3, $4, $5::bigint, $6, $7, $8::uuid,
                 $9, 'PENDING', 'RESERVED', 1, $10::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (transactionid) DO UPDATE
       SET merchant_msisdn = EXCLUDED.merchant_msisdn,
           merchant_type = EXCLUDED.merchant_type,
           service_url = EXCLUDED.service_url,
           config_id = EXCLUDED.config_id,
           config_version = EXCLUDED.config_version,
           integration_channel = EXCLUDED.integration_channel,
           correlation_id = COALESCE(sw_tbl_merchant_integration_attempt.correlation_id, EXCLUDED.correlation_id),
           confirmation_status = 'PENDING',
           attempt_count = sw_tbl_merchant_integration_attempt.attempt_count + 1,
           request_payload = EXCLUDED.request_payload,
           last_error = NULL,
           updated_at = CURRENT_TIMESTAMP`,
      [
        transaction.transactionId,
        merchant.msisdn,
        merchant.merchantType ?? 'Special',
        serviceUrl,
        configId,
        configVersion,
        channel,
        correlationId,
        idempotencyKey,
        JSON.stringify(message),
      ],
    );
  }

  private async saveMerchantAttemptDecision(
    transactionId: string,
    decision: MerchantConfirmationDecision | 'PENDING',
    httpStatus: number | null,
    body: unknown,
    channel: 'API' | 'KAFKA',
    responseCode?: string,
    responseMessage?: string,
    lastError?: string,
    externalReference?: string,
    outboundTopic?: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE public.sw_tbl_merchant_integration_attempt
       SET confirmation_status = $2::varchar,
           http_status = $3,
           response_payload = $4::jsonb,
           response_code = $5,
           response_message = $6,
           last_error = $7,
           integration_channel = $8,
           external_reference = $9,
           outbound_topic = $10,
           confirmed_at = CASE WHEN $2::varchar IN ('APPROVED', 'REJECTED') THEN CURRENT_TIMESTAMP ELSE confirmed_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE transactionid = $1::bigint`,
      [transactionId, decision, httpStatus, body === null ? null : JSON.stringify(body), responseCode,
        responseMessage, lastError, channel, externalReference ?? null, outboundTopic ?? null],
    );
  }

  private mappingTransaction(transaction: TransactionRequest): Record<string, unknown> {
    return {
      transactionId: transaction.transactionId,
      sourceWalletId: transaction.sourceWalletId,
      destinationWalletId: transaction.destinationWalletId,
      amount: transaction.amount,
      keyword: transaction.keyword,
      referenceId: transaction.referenceId,
      currency: transaction.currency,
      trnId: transaction.trnId,
    };
  }

  private async updateMerchantPostingStatus(
    transactionId: string,
    status: MerchantAttempt['postingStatus'],
    error?: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE public.sw_tbl_merchant_integration_attempt
       SET posting_status = $2, last_error = $3, updated_at = CURRENT_TIMESTAMP
       WHERE transactionid = $1::bigint`,
      [transactionId, status, error ?? null],
    );
  }

  private async findPostedMode(transactionId: string): Promise<TransactionMode | null> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT mode
       FROM public.sw_tbl_accounting_journal
       WHERE transactionid = $1::bigint AND action = 'POST'
       ORDER BY leg DESC
       LIMIT 1`,
      [transactionId],
    );
    const mode = rows[0]?.mode;
    return mode === 'DIRECT' || mode === 'TWO_LEG' ? mode : null;
  }

  private async upsertDispute(
    transactionId: string,
    disputeReference: string,
    reason: string | undefined,
    requestedBy: string | undefined,
    message: TransactionMessage,
  ): Promise<{ id: string; status: string }> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `INSERT INTO public.sw_tbl_transaction_dispute (
         transactionid, dispute_reference, reason, requested_by, request_payload
       ) VALUES ($1::bigint, $2, $3, $4, $5::jsonb)
       ON CONFLICT (transactionid, dispute_reference) DO UPDATE
       SET reason = COALESCE(EXCLUDED.reason, sw_tbl_transaction_dispute.reason),
           requested_by = COALESCE(EXCLUDED.requested_by, sw_tbl_transaction_dispute.requested_by),
           request_payload = EXCLUDED.request_payload,
           updated_at = CURRENT_TIMESTAMP
       RETURNING id::text, status`,
      [transactionId, disputeReference, reason ?? null, requestedBy ?? null, JSON.stringify(message)],
    );
    return { id: String(rows[0].id), status: String(rows[0].status) };
  }

  private async updateDispute(
    id: string,
    status: 'REVERSED' | 'BLOCKED' | 'FAILED',
    journalId: string | null,
    result: PostingResult | null,
    error: string | null,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE public.sw_tbl_transaction_dispute
       SET status = $2::varchar,
           reversal_journal_id = $3::bigint,
           result_payload = $4::jsonb,
           last_error = $5,
           completed_at = CASE WHEN $2::varchar = 'REVERSED' THEN CURRENT_TIMESTAMP ELSE completed_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::bigint`,
      [id, status, journalId, result === null ? null : JSON.stringify(result), error],
    );
  }

  private acceptPostingResult(result: PostingResult, acceptedStatuses: string[]): boolean {
    return result.success && acceptedStatuses.includes(result.statusCode);
  }

  private handlePostingFailure(result: PostingResult, context: string): void {
    const message = `${context} failed: ${result.statusCode} ${result.statusMessage}`;
    if (RETRYABLE_POSTING_STATUSES.has(result.statusCode)) {
      throw new Error(message);
    }
    this.logger.error(message);
  }

  private readTransactionId(message: TransactionMessage): string | undefined {
    return this.readString(message, ['TransactionId', 'transactionId']);
  }

  private readString(message: TransactionMessage, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = message[key];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
      }
    }
    return undefined;
  }

  private location(metadata: KafkaMessageMetadata): string {
    return `${metadata.topic}:${metadata.partition}:${metadata.offset}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private isObject(value: unknown): value is TransactionMessage {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
