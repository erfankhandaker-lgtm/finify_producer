import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AccountingConfigService } from '../accounting-config/accounting-config.service';
import { AccountingLoggerService } from '../common/accounting-logger.service';
import { EodOrchestrationService } from './eod-orchestration.service';

@Injectable()
export class EodSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EodSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly config: ConfigService,
    private readonly configurations: AccountingConfigService,
    private readonly orchestration: EodOrchestrationService,
    private readonly dataSource: DataSource,
    private readonly accountingLog: AccountingLoggerService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('ACCOUNTING_AUTO_EOD', 'false') !== 'true') {
      this.logger.log('Automatic EOD scheduler is disabled');
      return;
    }
    const interval = Math.max(Number(this.config.get('ACCOUNTING_SCHEDULER_INTERVAL_MS', 30000)), 10000);
    this.timer = setInterval(() => void this.runCatchUp(), interval);
    void this.runCatchUp();
    this.logger.log(`Automatic EOD scheduler enabled with ${interval}ms polling`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Reconciles wall-clock cutoffs with persisted CLOSED periods. This deliberately
   * does not depend on seeing the exact cutoff minute: after downtime or a restart,
   * every missing business date is recovered oldest-first.
   */
  async runCatchUp(now = new Date()) {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const entity = this.config.get<string>('ACCOUNTING_REPORTING_ENTITY', 'FINIFY_UK');
      const configurations = await this.configurations.activeCurrencies(entity);
      for (const configuration of configurations) {
        const latestDueDate = this.latestDueDate(now, configuration.businessTimezone, configuration.cutoffTime);
        const dueDates = await this.overdueDates(entity, configuration.currency, latestDueDate);
        for (const businessDate of dueDates) {
          const key = `${entity}:${businessDate}:${configuration.currency}`;
          try {
            const outcome = await this.orchestration.runOne({
              businessDate, currency: configuration.currency, reportingEntity: entity,
              requestedBy: 'EOD_CATCH_UP_SCHEDULER', dryRun: false,
              correlationId: `SCHEDULED:${key}`,
            });
            if (outcome.status !== 'CLOSED') {
              throw new Error(`EOD returned ${outcome.status}`);
            }
            this.accountingLog.info({
              event: 'EOD_CATCH_UP_COMPLETED', correlationId: `SCHEDULED:${key}`,
              businessDate, currency: configuration.currency, reportingEntity: entity,
              status: 'CLOSED',
            });
          } catch (error) {
            // Never skip over a failed date: later balances depend on the prior close.
            this.logger.error(`Scheduled EOD ${key} failed: ${error instanceof Error ? error.message : String(error)}`);
            this.accountingLog.error({
              event: 'EOD_CATCH_UP_BLOCKED', correlationId: `SCHEDULED:${key}`,
              businessDate, currency: configuration.currency, reportingEntity: entity,
              status: 'FAILED',
            }, error);
            break;
          }
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  private async overdueDates(entity: string, currency: string, latestDueDate: string) {
    const rows = await this.dataSource.query<Array<{ lastClosed: string | null; earliestOpen: string | null }>>(
      `SELECT
         to_char(max(business_date) FILTER (WHERE status='CLOSED'),'YYYY-MM-DD') AS "lastClosed",
         to_char(min(business_date) FILTER (WHERE status<>'CLOSED'),'YYYY-MM-DD') AS "earliestOpen"
       FROM public.sw_tbl_accounting_period
       WHERE reporting_entity=$1 AND currency=$2 AND business_date<=$3::date`,
      [entity, currency.toUpperCase(), latestDueDate],
    );
    const state = rows[0] ?? { lastClosed: null, earliestOpen: null };
    const start = state.lastClosed
      ? this.addDays(state.lastClosed, 1)
      : state.earliestOpen ?? latestDueDate;
    const maxDays = Math.max(
      1,
      Number(this.config.get('ACCOUNTING_CATCH_UP_MAX_DAYS_PER_TICK', 31)) || 31,
    );
    const dates: string[] = [];
    for (let date = start; date <= latestDueDate && dates.length < maxDays; date = this.addDays(date, 1)) {
      dates.push(date);
    }
    return dates;
  }

  private latestDueDate(now: Date, timezone: string, cutoffTime: string) {
    const parts = this.parts(now, timezone);
    const [cutoffHour, cutoffMinute] = cutoffTime.split(':').map(Number);
    const afterCutoff = Number(parts.hour) * 60 + Number(parts.minute) >= cutoffHour * 60 + cutoffMinute;
    // A cutoff closes the preceding local business date. Before today's cutoff,
    // yesterday is not due yet, so the latest due date is two local dates back.
    return this.addDays(parts.date, afterCutoff ? -1 : -2);
  }

  private parts(date: Date, timezone: string) {
    const values = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]),
    );
    return { date: `${values.year}-${values.month}-${values.day}`, hour: values.hour, minute: values.minute };
  }

  private addDays(value: string, days: number) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  }
}
