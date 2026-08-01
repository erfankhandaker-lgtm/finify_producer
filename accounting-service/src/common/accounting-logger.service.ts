import { Injectable, Logger } from '@nestjs/common';

export interface AccountingLogContext {
  event: string;
  correlationId?: string;
  eodBatchId?: string;
  eodRunId?: string;
  businessDate?: string;
  currency?: string;
  reportingEntity?: string;
  step?: string;
  durationMs?: number;
  status?: string;
  counts?: Record<string, number>;
  totals?: Record<string, string | number | null>;
  errorCode?: string;
  errorMessage?: string;
  enabled?: boolean;
  businessTimezone?: string;
  closureTime?: string;
  requestedBy?: string;
}

@Injectable()
export class AccountingLoggerService {
  private readonly logger = new Logger('Accounting');

  info(context: AccountingLogContext) {
    this.logger.log(JSON.stringify(this.clean(context)));
  }

  warn(context: AccountingLogContext) {
    this.logger.warn(JSON.stringify(this.clean(context)));
  }

  error(context: AccountingLogContext, error?: unknown) {
    const errorMessage = error instanceof Error ? error.message : error ? String(error) : context.errorMessage;
    this.logger.error(JSON.stringify(this.clean({ ...context, errorMessage })));
  }

  private clean(context: AccountingLogContext) {
    return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined));
  }
}
