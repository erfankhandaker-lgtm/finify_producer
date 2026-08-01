import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AccountingConfigService } from '../accounting-config/accounting-config.service';
import { AccountingLoggerService } from '../common/accounting-logger.service';
import { UpdateEodScheduleDto } from './eod.dto';
import { EodOrchestrationService } from './eod-orchestration.service';

type ScheduleRow = {
  reportingEntity: string;
  enabled: boolean;
  businessTimezone: string;
  closureTime: string;
  lastTickAt?: string;
  lastRunAt?: string;
  lastBusinessDate?: string;
  lastStatus?: string;
  lastMessage?: string;
  updatedBy?: string;
  updatedAt?: string;
};

@Injectable()
export class EodSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EodSchedulerService.name);
  private readonly instanceId = `accounting-${randomUUID()}`;
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
    const interval = Math.max(Number(this.config.get('ACCOUNTING_SCHEDULER_INTERVAL_MS', 30000)), 10000);
    this.timer = setInterval(() => void this.runCatchUp(), interval);
    void this.runCatchUp();
    this.logger.log(`Database-controlled EOD scheduler enabled with ${interval}ms polling`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async getSchedule(reportingEntity = 'FINIFY_UK', now = new Date()) {
    const schedule = await this.schedule(reportingEntity);
    const currencies = await this.dataSource.query(
      `SELECT config.currency,
              period.status AS "latestPeriodStatus",
              to_char(period.business_date,'YYYY-MM-DD') AS "latestPeriodDate",
              period.closed_at AS "lastClosedAt",
              period.closed_by AS "lastClosedBy"
       FROM public.sw_tbl_accounting_configuration config
       LEFT JOIN LATERAL (
         SELECT row.status,row.business_date,row.closed_at,row.closed_by
         FROM public.sw_tbl_accounting_period row
         WHERE row.reporting_entity=config.reporting_entity AND row.currency=config.currency
         ORDER BY row.business_date DESC LIMIT 1
       ) period ON true
       WHERE config.reporting_entity=$1 AND config.is_active
         AND config.effective_from<=CURRENT_DATE
         AND (config.effective_to IS NULL OR config.effective_to>=CURRENT_DATE)
       ORDER BY config.currency`,
      [reportingEntity],
    );
    return {
      ...schedule,
      nextClosureLocal: this.nextClosureLocal(now, schedule.businessTimezone, schedule.closureTime),
      closesBusinessDate: this.businessDateAtNextClosure(now, schedule.businessTimezone, schedule.closureTime),
      scheduleSemantics: 'The configured local time closes the preceding business date.',
      currencies,
      currencyCount: currencies.length,
      closedCurrencyCount: currencies.filter((row: any) => row.latestPeriodStatus === 'CLOSED').length,
    };
  }

  async updateSchedule(dto: UpdateEodScheduleDto) {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: dto.businessTimezone }).format(new Date());
    } catch {
      throw new BadRequestException('businessTimezone must be a valid IANA timezone');
    }
    const closureTime = dto.closureTime.length === 5 ? `${dto.closureTime}:00` : dto.closureTime;
    await this.dataSource.query(
      `INSERT INTO public.sw_tbl_eod_schedule(
         reporting_entity,enabled,business_timezone,closure_time,updated_by,updated_at)
       VALUES($1,$2,$3,$4::time,$5,CURRENT_TIMESTAMP)
       ON CONFLICT(reporting_entity) DO UPDATE SET
         enabled=EXCLUDED.enabled,business_timezone=EXCLUDED.business_timezone,
         closure_time=EXCLUDED.closure_time,updated_by=EXCLUDED.updated_by,
         updated_at=CURRENT_TIMESTAMP`,
      [dto.reportingEntity, dto.enabled, dto.businessTimezone, closureTime, dto.updatedBy],
    );
    this.accountingLog.info({
      event: 'EOD_SCHEDULE_UPDATED', reportingEntity: dto.reportingEntity,
      enabled: dto.enabled, businessTimezone: dto.businessTimezone,
      closureTime, requestedBy: dto.updatedBy,
    });
    return this.getSchedule(dto.reportingEntity);
  }

  /**
   * Reconciles wall-clock closure times with persisted CLOSED periods. It does
   * not depend on seeing the exact minute: downtime is recovered oldest-first.
   */
  async runCatchUp(now = new Date(), force = false, reportingEntity?: string) {
    if (this.ticking) return { status: 'BUSY', message: 'The scheduler is already running' };
    this.ticking = true;
    const entity = reportingEntity || this.config.get<string>('ACCOUNTING_REPORTING_ENTITY', 'FINIFY_UK');
    let acquired = false;
    let attempted = 0;
    let closed = 0;
    let blocked = 0;
    let lastBusinessDate: string | null = null;
    let status = 'IDLE';
    let message = 'No business dates are due';
    try {
      const schedule = await this.acquireSchedule(entity, force);
      if (!schedule) return { status: 'DISABLED_OR_LEASED', message: 'Schedule is disabled or another instance owns the close lease' };
      acquired = true;
      const configurations = await this.configurations.activeCurrencies(entity);
      const latestDueDate = this.latestDueDate(now, schedule.businessTimezone, schedule.closureTime);
      for (const configuration of configurations) {
        const dueDates = await this.overdueDates(entity, configuration.currency, latestDueDate);
        for (const businessDate of dueDates) {
          attempted += 1;
          lastBusinessDate = businessDate;
          const key = `${entity}:${businessDate}:${configuration.currency}`;
          try {
            const outcome = await this.orchestration.runOne({
              businessDate, currency: configuration.currency, reportingEntity: entity,
              requestedBy: 'EOD_CATCH_UP_SCHEDULER', dryRun: false,
              correlationId: `SCHEDULED:${key}`,
            });
            if (outcome.status !== 'CLOSED') throw new Error(`EOD returned ${outcome.status}`);
            closed += 1;
            this.accountingLog.info({
              event: 'EOD_CATCH_UP_COMPLETED', correlationId: `SCHEDULED:${key}`,
              businessDate, currency: configuration.currency, reportingEntity: entity,
              status: 'CLOSED',
            });
          } catch (error) {
            blocked += 1;
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
      status = blocked ? (closed ? 'PARTIAL' : 'BLOCKED') : attempted ? 'COMPLETED' : 'IDLE';
      message = attempted
        ? `${closed} of ${attempted} due currency dates closed${blocked ? `; ${blocked} blocked` : ''}`
        : 'No business dates are due';
      return { status, message, reportingEntity: entity, latestDueDate, attempted, closed, blocked, lastBusinessDate };
    } catch (error) {
      status = 'FAILED';
      message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Automatic EOD scheduler failed: ${message}`);
      return { status, message, reportingEntity: entity, attempted, closed, blocked, lastBusinessDate };
    } finally {
      if (acquired) await this.releaseSchedule(entity, status, message, attempted > 0, lastBusinessDate);
      this.ticking = false;
    }
  }

  private async schedule(entity: string): Promise<ScheduleRow> {
    const [row] = await this.dataSource.query(
      `SELECT reporting_entity AS "reportingEntity",enabled,
              business_timezone AS "businessTimezone",closure_time::text AS "closureTime",
              last_tick_at AS "lastTickAt",last_run_at AS "lastRunAt",
              to_char(last_business_date,'YYYY-MM-DD') AS "lastBusinessDate",last_status AS "lastStatus",
              last_message AS "lastMessage",updated_by AS "updatedBy",updated_at AS "updatedAt"
       FROM public.sw_tbl_eod_schedule WHERE reporting_entity=$1`,
      [entity],
    );
    if (row) return row;
    await this.dataSource.query(
      `INSERT INTO public.sw_tbl_eod_schedule(reporting_entity,updated_by)
       VALUES($1,'EOD_SCHEDULER') ON CONFLICT DO NOTHING`, [entity],
    );
    return this.schedule(entity);
  }

  private async acquireSchedule(entity: string, force: boolean): Promise<ScheduleRow | null> {
    const [row] = await this.dataSource.query(
      `UPDATE public.sw_tbl_eod_schedule SET
         lease_owner=$2,lease_until=CURRENT_TIMESTAMP + INTERVAL '10 minutes',
         last_tick_at=CURRENT_TIMESTAMP,last_status='RUNNING'
       WHERE reporting_entity=$1 AND ($3::boolean OR enabled)
         AND (lease_until IS NULL OR lease_until<CURRENT_TIMESTAMP OR lease_owner=$2)
       RETURNING reporting_entity AS "reportingEntity",enabled,
         business_timezone AS "businessTimezone",closure_time::text AS "closureTime"`,
      [entity, this.instanceId, force],
    );
    return row || null;
  }

  private releaseSchedule(entity: string, status: string, message: string, ran: boolean, businessDate: string | null) {
    return this.dataSource.query(
      `UPDATE public.sw_tbl_eod_schedule SET
         lease_owner=NULL,lease_until=NULL,last_tick_at=CURRENT_TIMESTAMP,
         last_run_at=CASE WHEN $3::boolean THEN CURRENT_TIMESTAMP ELSE last_run_at END,
         last_business_date=COALESCE($4::date,last_business_date),last_status=$5,last_message=$6
       WHERE reporting_entity=$1 AND lease_owner=$2`,
      [entity, this.instanceId, ran, businessDate, status, message],
    );
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
    const start = state.lastClosed ? this.addDays(state.lastClosed, 1) : state.earliestOpen ?? latestDueDate;
    const maxDays = Math.max(1, Number(this.config.get('ACCOUNTING_CATCH_UP_MAX_DAYS_PER_TICK', 31)) || 31);
    const dates: string[] = [];
    for (let date = start; date <= latestDueDate && dates.length < maxDays; date = this.addDays(date, 1)) dates.push(date);
    return dates;
  }

  private latestDueDate(now: Date, timezone: string, closureTime: string) {
    const parts = this.parts(now, timezone);
    const [closureHour, closureMinute] = closureTime.split(':').map(Number);
    const afterClosure = Number(parts.hour) * 60 + Number(parts.minute) >= closureHour * 60 + closureMinute;
    return this.addDays(parts.date, afterClosure ? -1 : -2);
  }

  private nextClosureLocal(now: Date, timezone: string, closureTime: string) {
    const parts = this.parts(now, timezone);
    const [closureHour, closureMinute] = closureTime.split(':').map(Number);
    const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);
    const closureMinutes = closureHour * 60 + closureMinute;
    const date = currentMinutes < closureMinutes ? parts.date : this.addDays(parts.date, 1);
    return `${date} ${closureTime.slice(0, 8)} ${timezone}`;
  }

  private businessDateAtNextClosure(now: Date, timezone: string, closureTime: string) {
    const parts = this.parts(now, timezone);
    const [closureHour, closureMinute] = closureTime.split(':').map(Number);
    const beforeClosure = Number(parts.hour) * 60 + Number(parts.minute) < closureHour * 60 + closureMinute;
    return this.addDays(parts.date, beforeClosure ? -1 : 0);
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
