import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateMerchantRefundDto } from './merchant-refund.dto';

@Injectable()
export class MerchantRefundService {
  constructor(private readonly dataSource: DataSource) {}

  async create(dto: CreateMerchantRefundDto): Promise<Record<string, unknown>> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT * FROM public.sw_proc_full_merchant_refund(
        $1::bigint,$2::text,$3::text,$4::text
      )`,
      [
        dto.originalTransactionId,
        dto.refundReference.trim(),
        dto.reason?.trim() || null,
        dto.requestedBy?.trim() || null,
      ],
    );
    const result = rows[0];
    const code = String(result?.status_code || 'UNKNOWN');
    if (result?.success === true) return result;
    if (code === 'TRANSACTION_NOT_FOUND') {
      throw new NotFoundException(String(result.status_message));
    }
    if (code === 'IDEMPOTENCY_CONFLICT') {
      throw new ConflictException(String(result.status_message));
    }
    throw new BadRequestException(String(result?.status_message || 'Merchant refund failed'));
  }

  async getByOriginal(originalTransactionId: string): Promise<Record<string, unknown>> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT id::text,
              original_transaction_id::text AS "originalTransactionId",
              refund_transaction_id::text AS "refundTransactionId",
              refund_reference AS "refundReference",reason,
              requested_by AS "requestedBy",status,journal_id::text AS "journalId",
              created_at AS "createdAt",completed_at AS "completedAt"
       FROM public.sw_tbl_merchant_refund
       WHERE original_transaction_id=$1::bigint`,
      [originalTransactionId],
    );
    if (!rows[0]) throw new NotFoundException('Merchant refund was not found');
    return rows[0];
  }
}
