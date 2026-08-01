import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GeneralLedgerQueryDto, JournalReportQueryDto } from './accounting-report.dto';

type NumericRow = Record<string, unknown> & {
  totalDebit?: string;
  totalCredit?: string;
};

@Injectable()
export class AccountingReportService {
  constructor(private readonly dataSource: DataSource) {}

  async journals(query: JournalReportQueryDto) {
    this.validateRange(query.dateFrom, query.dateTo);
    const values: unknown[] = [
      query.reportingEntity,
      query.currency.toUpperCase(),
      query.dateFrom,
      query.dateTo,
    ];
    const filters = [
      'journal.reporting_entity=$1',
      `($2='ALL' OR journal.currency=$2)`,
      'journal.business_date BETWEEN $3::date AND $4::date',
    ];
    if (query.status) {
      values.push(query.status);
      filters.push(`journal.status=$${values.length}`);
    }
    if (query.search?.trim()) {
      values.push(`%${query.search.trim()}%`);
      filters.push(`(
        journal.id::text ILIKE $${values.length}
        OR journal.transactionid::text ILIKE $${values.length}
        OR COALESCE(journal.reference,'') ILIKE $${values.length}
        OR COALESCE(journal.keyword,'') ILIKE $${values.length}
      )`);
    }
    const where = filters.join(' AND ');
    const [countRow] = await this.dataSource.query(
      `SELECT count(*)::int AS count
       FROM public.sw_tbl_accounting_journal journal
       WHERE ${where}`,
      values,
    );
    const totalRecords = Number(countRow?.count || 0);
    const offset = (query.page - 1) * query.limit;
    const data = await this.dataSource.query(
      `SELECT journal.id::text AS id,journal.transactionid::text AS "transactionId",
              journal.mode,journal.action,journal.leg,journal.status,journal.keyword,
              journal.reference,journal.currency,to_char(journal.business_date,'YYYY-MM-DD') AS "businessDate",
              journal.created_at AS "createdAt",journal.completed_at AS "completedAt",
              journal.original_journal_id::text AS "originalJournalId",
              COALESCE(lines."lineCount",0)::int AS "lineCount",
              COALESCE(lines."totalDebit",0)::numeric AS "totalDebit",
              COALESCE(lines."totalCredit",0)::numeric AS "totalCredit",
              COALESCE(lines."totalDebit",0)=COALESCE(lines."totalCredit",0) AS balanced
       FROM public.sw_tbl_accounting_journal journal
       LEFT JOIN LATERAL (
         SELECT count(*) AS "lineCount",sum(entry."Debit") AS "totalDebit",
                sum(entry."Credit") AS "totalCredit"
         FROM public.sw_tbl_accounting_entry entry WHERE entry.journal_id=journal.id
       ) lines ON true
       WHERE ${where}
       ORDER BY journal.business_date DESC,journal.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.limit, offset],
    );
    return {
      data,
      totalRecords,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(totalRecords / query.limit)),
    };
  }

  async journal(id: string) {
    if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid journal identifier');
    const [journal] = await this.dataSource.query(
      `SELECT journal.id::text AS id,journal.transactionid::text AS "transactionId",
              journal.mode,journal.action,journal.leg,journal.status,journal.keyword,
              journal.reference,journal.currency,journal.reporting_entity AS "reportingEntity",
              to_char(journal.business_date,'YYYY-MM-DD') AS "businessDate",journal.original_journal_id::text AS "originalJournalId",
              journal.error_message AS "errorMessage",journal.created_at AS "createdAt",
              journal.completed_at AS "completedAt"
       FROM public.sw_tbl_accounting_journal journal WHERE journal.id=$1::bigint`,
      [id],
    );
    if (!journal) throw new NotFoundException('Accounting journal was not found');
    const entries = await this.dataSource.query(
      `SELECT entry.id::text AS id,entry.line_number AS "lineNumber",
              entry.accountnumber::text AS "accountNumber",
              COALESCE(mapping.gl_account_code,entry.account_code) AS "glAccountCode",
              COALESCE(gl.account_name,category.accountname,entry.account_code) AS "accountName",
              entry."Debit"::numeric AS debit,entry."Credit"::numeric AS credit,
              entry.currency,entry.description,entry.balance_before::numeric AS "balanceBefore",
              entry.balance_after::numeric AS "balanceAfter",entry.entrydate AS "entryDate",
              entry.reverses_entry_id::text AS "reversesEntryId"
       FROM public.sw_tbl_accounting_entry entry
       LEFT JOIN public."SW_TBL_WALLET" wallet ON wallet."Wallet_MSISDN"=entry.accountnumber
       LEFT JOIN public.sw_tbl_wallet_gl_mapping mapping
         ON mapping.wallet_code=wallet."Wallet_Code" AND mapping.is_active
       LEFT JOIN public.sw_tbl_gl_account gl ON gl.account_code=mapping.gl_account_code
       LEFT JOIN public.sw_tbl_accounting_category category ON category.id=entry.accounttype
       WHERE entry.journal_id=$1::bigint ORDER BY entry.line_number`,
      [id],
    ) as NumericRow[];
    const totalDebit = entries.reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const totalCredit = entries.reduce((sum, row) => sum + Number(row.credit || 0), 0);
    return {
      journal,
      entries,
      totals: {
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
        difference: (totalDebit - totalCredit).toFixed(2),
        balanced: Math.abs(totalDebit - totalCredit) < 0.005,
      },
    };
  }

  async generalLedger(query: GeneralLedgerQueryDto) {
    this.validateRange(query.dateFrom, query.dateTo);
    const values: unknown[] = [
      query.reportingEntity,
      query.currency.toUpperCase(),
      query.dateFrom,
      query.dateTo,
    ];
    const filters = [
      'entry.reporting_entity=$1',
      `($2='ALL' OR entry.currency=$2)`,
      'entry.business_date BETWEEN $3::date AND $4::date',
    ];
    if (query.accountCode?.trim()) {
      values.push(query.accountCode.trim());
      filters.push(`COALESCE(mapping.gl_account_code,'UNMAPPED:' || entry.account_code)=$${values.length}`);
    }
    if (query.search?.trim()) {
      values.push(`%${query.search.trim()}%`);
      filters.push(`(
        journal.id::text ILIKE $${values.length}
        OR entry.transactionid::text ILIKE $${values.length}
        OR entry.accountnumber::text ILIKE $${values.length}
        OR COALESCE(journal.reference,'') ILIKE $${values.length}
        OR COALESCE(entry.description,'') ILIKE $${values.length}
      )`);
    }
    const where = filters.join(' AND ');
    const joins = `
      JOIN public.sw_tbl_accounting_journal journal ON journal.id=entry.journal_id
      LEFT JOIN public."SW_TBL_WALLET" wallet ON wallet."Wallet_MSISDN"=entry.accountnumber
      LEFT JOIN public.sw_tbl_wallet_gl_mapping mapping
        ON mapping.wallet_code=wallet."Wallet_Code" AND mapping.is_active
      LEFT JOIN public.sw_tbl_gl_account gl ON gl.account_code=mapping.gl_account_code
      LEFT JOIN public.sw_tbl_accounting_category category ON category.id=entry.accounttype`;
    const [countRow] = await this.dataSource.query(
      `SELECT count(*)::int AS count
       FROM public.sw_tbl_accounting_entry entry ${joins} WHERE ${where}`,
      values,
    );
    const [totalsRow] = await this.dataSource.query(
      `SELECT COALESCE(sum(entry."Debit"),0)::numeric AS "totalDebit",
              COALESCE(sum(entry."Credit"),0)::numeric AS "totalCredit",
              count(*) FILTER (WHERE mapping.gl_account_code IS NULL)::int AS "unmappedCount"
       FROM public.sw_tbl_accounting_entry entry ${joins} WHERE ${where}`,
      values,
    );
    const currencyTotals = await this.dataSource.query(
      `SELECT entry.currency,
              COALESCE(sum(entry."Debit"),0)::numeric AS "totalDebit",
              COALESCE(sum(entry."Credit"),0)::numeric AS "totalCredit",
              count(*)::int AS "lineCount"
       FROM public.sw_tbl_accounting_entry entry ${joins}
       WHERE ${where}
       GROUP BY entry.currency
       ORDER BY entry.currency`,
      values,
    );
    const accountFilter = query.accountCode?.trim()
      ? `AND COALESCE(mapping.gl_account_code,'UNMAPPED:' || entry.account_code)=$5`
      : '';
    const accounts = await this.dataSource.query(
      `SELECT entry.currency,
              COALESCE(gl.account_code,'UNMAPPED:' || entry.account_code) AS "accountCode",
              COALESCE(gl.account_name,category.accountname,entry.account_code) AS "accountName",
              COALESCE(gl.account_type,category.accounttype,'UNKNOWN') AS "accountType",
              COALESCE(gl.normal_balance,category.normal_balance,'DEBIT') AS "normalBalance",
              COALESCE(sum(CASE WHEN entry.business_date<$3::date
                THEN CASE WHEN COALESCE(gl.normal_balance,category.normal_balance,'DEBIT')='DEBIT'
                  THEN entry."Debit"-entry."Credit" ELSE entry."Credit"-entry."Debit" END
                ELSE 0 END),0)::numeric AS "openingBalance",
              COALESCE(sum(CASE WHEN entry.business_date>=$3::date THEN entry."Debit" ELSE 0 END),0)::numeric AS "periodDebit",
              COALESCE(sum(CASE WHEN entry.business_date>=$3::date THEN entry."Credit" ELSE 0 END),0)::numeric AS "periodCredit"
       FROM public.sw_tbl_accounting_entry entry ${joins}
       WHERE entry.reporting_entity=$1 AND ($2='ALL' OR entry.currency=$2)
         AND entry.business_date<=$4::date ${accountFilter}
       GROUP BY 1,2,3,4,5
       ORDER BY 1,2`,
      query.accountCode?.trim()
        ? [
            query.reportingEntity,
            query.currency.toUpperCase(),
            query.dateFrom,
            query.dateTo,
            query.accountCode.trim(),
          ]
        : [query.reportingEntity, query.currency.toUpperCase(), query.dateFrom, query.dateTo],
    );
    const enrichedAccounts = accounts.map((row: Record<string, unknown>) => {
      const opening = Number(row.openingBalance || 0);
      const debit = Number(row.periodDebit || 0);
      const credit = Number(row.periodCredit || 0);
      const closing = String(row.normalBalance) === 'DEBIT'
        ? opening + debit - credit
        : opening + credit - debit;
      return { ...row, closingBalance: closing.toFixed(2) };
    });
    const totalRecords = Number(countRow?.count || 0);
    const totalDebit = Number(totalsRow?.totalDebit || 0);
    const totalCredit = Number(totalsRow?.totalCredit || 0);
    const offset = (query.page - 1) * query.limit;
    const data = await this.dataSource.query(
      `SELECT entry.id::text AS id,to_char(entry.business_date,'YYYY-MM-DD') AS "businessDate",
              entry.entrydate AS "entryDate",journal.id::text AS "journalId",
              entry.transactionid::text AS "transactionId",journal.reference,
              journal.keyword,journal.action,journal.leg,journal.status,
              COALESCE(mapping.gl_account_code,'UNMAPPED:' || entry.account_code) AS "accountCode",
              COALESCE(gl.account_name,category.accountname,entry.account_code) AS "accountName",
              mapping.gl_account_code IS NULL AS "mappingException",
              entry.accountnumber::text AS "walletAccount",
              entry.description,entry."Debit"::numeric AS debit,
              entry."Credit"::numeric AS credit,entry.currency
       FROM public.sw_tbl_accounting_entry entry ${joins}
       WHERE ${where}
       ORDER BY entry.business_date DESC,entry.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.limit, offset],
    );
    return {
      data,
      accounts: enrichedAccounts,
      totals: {
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
        difference: (totalDebit - totalCredit).toFixed(2),
        balanced: Math.abs(totalDebit - totalCredit) < 0.005,
        unmappedCount: Number(totalsRow?.unmappedCount || 0),
      },
      currencyTotals: currencyTotals.map((row: Record<string, unknown>) => ({
        ...row,
        difference: (Number(row.totalDebit || 0) - Number(row.totalCredit || 0)).toFixed(2),
        balanced: Math.abs(Number(row.totalDebit || 0) - Number(row.totalCredit || 0)) < 0.005,
      })),
      totalRecords,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(totalRecords / query.limit)),
    };
  }

  private validateRange(from: string, to: string) {
    if (from > to) throw new BadRequestException('dateFrom must not be after dateTo');
    const days = (Date.parse(to) - Date.parse(from)) / 86400000;
    if (days > 366) throw new BadRequestException('Report date range cannot exceed 366 days');
  }
}
