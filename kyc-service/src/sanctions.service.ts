import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { XMLParser } from 'fast-xml-parser';
import { Pool, PoolClient } from 'pg';
import { DATABASE } from './database';

type SanctionRecord = {
  normalizedName: string;
  originalName: string;
  source: string;
  sourceRecordId: string;
};

const OFAC_SDN_URL = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML';
const UN_CONSOLIDATED_URL = 'https://scsanctions.un.org/resources/xml/en/consolidated.xml';

@Injectable()
export class SanctionsService {
  private readonly xml = new XMLParser({ ignoreAttributes: false, parseTagValue: true });

  constructor(@Inject(DATABASE) private readonly db: Pool) {}

  async status() {
    const [counts, latest, history] = await Promise.all([
      this.db.query(
        `SELECT source,count(*)::int AS count,max(updated_at) AS "updatedAt"
         FROM kyc.sanction_records GROUP BY source ORDER BY source`,
      ),
      this.db.query(
        `SELECT max(completed_at) FILTER (WHERE status='COMPLETED') AS "lastSuccessfulSync",
                bool_or(status='RUNNING') AS "syncing"
         FROM kyc.sanction_sync_runs`,
      ),
      this.db.query(
        `SELECT id,mode,source,status,records_received AS "recordsReceived",
                records_applied AS "recordsApplied",file_name AS "fileName",
                actor_id AS actor,error_message AS error,
                started_at AS "startedAt",completed_at AS "completedAt"
         FROM kyc.sanction_sync_runs ORDER BY started_at DESC LIMIT 20`,
      ),
    ]);
    return {
      totalRecords: counts.rows.reduce((total, row) => total + Number(row.count), 0),
      sources: counts.rows,
      lastSuccessfulSync: latest.rows[0]?.lastSuccessfulSync || null,
      syncing: Boolean(latest.rows[0]?.syncing),
      history: history.rows,
      officialSources: [
        { code: 'OFAC', label: 'US OFAC SDN', url: OFAC_SDN_URL },
        { code: 'UNSCR', label: 'UN Security Council Consolidated List', url: UN_CONSOLIDATED_URL },
      ],
    };
  }

  async syncOfficial(actor: string) {
    return this.withLock(async (client) => {
      const runId = await this.startRun(client, 'OFFICIAL', 'OFAC+UNSCR', actor);
      try {
        const [ofacXml, unXml] = await Promise.all([
          this.download(OFAC_SDN_URL),
          this.download(UN_CONSOLIDATED_URL),
        ]);
        const ofacRecords = this.parseOfac(ofacXml);
        const unRecords = this.parseUn(unXml);
        if (ofacRecords.length < 10_000) {
          throw new Error(`OFAC download returned only ${ofacRecords.length} records`);
        }
        if (unRecords.length < 500) {
          throw new Error(`UN download returned only ${unRecords.length} records`);
        }
        const records = [...ofacRecords, ...unRecords];
        const applied = await this.replace(client, records, ['OFAC', 'UNSCR']);
        await this.completeRun(client, runId, records.length, applied);
        return { runId, status: 'COMPLETED', recordsReceived: records.length, recordsApplied: applied };
      } catch (error) {
        await this.failRun(client, runId, error);
        throw new InternalServerErrorException(
          error instanceof Error ? `Sanctions sync failed: ${error.message}` : 'Sanctions sync failed',
        );
      }
    });
  }

  async uploadManual(
    file: Express.Multer.File | undefined,
    listName: string,
    mode: string,
    actor: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('CSV file is required');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('CSV file exceeds 10 MB');
    if (!/\.csv$/i.test(file.originalname) && !/csv/i.test(file.mimetype || '')) {
      throw new BadRequestException('Manual sanctions lists must be CSV files');
    }
    const source = `MANUAL_${String(listName || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
    if (!/^MANUAL_[A-Z0-9_]{2,32}$/.test(source)) {
      throw new BadRequestException('List name must contain 2 to 32 letters or numbers');
    }
    const normalizedMode = String(mode || 'REPLACE').toUpperCase();
    if (!['REPLACE', 'MERGE'].includes(normalizedMode)) {
      throw new BadRequestException('Upload mode must be REPLACE or MERGE');
    }
    let rows: Array<Record<string, string>>;
    try {
      rows = parse(file.buffer, {
        columns: (headers: string[]) => headers.map((header) => header.trim().toLowerCase()),
        bom: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: false,
      });
    } catch (error) {
      throw new BadRequestException(`CSV could not be parsed: ${error instanceof Error ? error.message : 'invalid file'}`);
    }
    if (!rows.length || rows.length > 100_000) {
      throw new BadRequestException('CSV must contain between 1 and 100,000 records');
    }
    const records = rows.map((row, index) => {
      const name = String(row.name || row.original_name || '').trim();
      const recordId = String(row.record_id || row.source_record_id || '').trim();
      if (!name || !recordId) {
        throw new BadRequestException(`CSV row ${index + 2} requires name and record_id`);
      }
      return this.record(name, source, recordId);
    });
    const unique = new Map(records.map((record) => [record.sourceRecordId, record]));
    const deduplicated = [...unique.values()];
    return this.withLock(async (client) => {
      const runMode = normalizedMode === 'REPLACE' ? 'MANUAL_REPLACE' : 'MANUAL_MERGE';
      const runId = await this.startRun(
        client,
        runMode,
        source,
        actor,
        file.originalname,
        createHash('sha256').update(file.buffer).digest('hex'),
      );
      try {
        const applied = await this.replace(
          client,
          deduplicated,
          normalizedMode === 'REPLACE' ? [source] : [],
        );
        await this.completeRun(client, runId, records.length, applied);
        return { runId, status: 'COMPLETED', source, recordsReceived: records.length, recordsApplied: applied };
      } catch (error) {
        await this.failRun(client, runId, error);
        throw error;
      }
    });
  }

  private async withLock<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.db.connect();
    try {
      const lock = await client.query(`SELECT pg_try_advisory_lock(910033) AS locked`);
      if (!lock.rows[0]?.locked) throw new ConflictException('Another sanctions-list operation is running');
      return await work(client);
    } finally {
      try { await client.query(`SELECT pg_advisory_unlock(910033)`); } catch {}
      client.release();
    }
  }

  private async download(url: string) {
    const response = await fetch(url, {
      headers: {
        accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1',
        'user-agent': 'Mozilla/5.0 (compatible; FinifyKYC-SanctionsSync/1.0)',
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status !== 200) {
      throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 100 * 1024 * 1024) throw new Error('Official sanctions file exceeds 100 MB');
    const text = await response.text();
    if (text.length > 100 * 1024 * 1024) throw new Error('Official sanctions file exceeds 100 MB');
    return text;
  }

  private parseOfac(xml: string) {
    const data = this.xml.parse(xml);
    const entries = this.array(data?.sdnList?.sdnEntry);
    return entries.flatMap((entry: any) => {
      const primary = [entry.firstName, entry.lastName].filter(Boolean).join(' ').trim();
      const names = primary ? [this.record(primary, 'OFAC', String(entry.uid || primary))] : [];
      for (const alias of this.array(entry.akaList?.aka)) {
        const aliasName = [alias.firstName, alias.lastName].filter(Boolean).join(' ').trim();
        if (aliasName) names.push(this.record(aliasName, 'OFAC', `${entry.uid}:AKA:${alias.uid || names.length}`));
      }
      return names;
    });
  }

  private parseUn(xml: string) {
    const data = this.xml.parse(xml)?.CONSOLIDATED_LIST;
    const people = this.array(data?.INDIVIDUALS?.INDIVIDUAL).map((entry: any) => ({
      id: entry.DATAID || entry.REFERENCE_NUMBER,
      name: [entry.FIRST_NAME, entry.SECOND_NAME, entry.THIRD_NAME, entry.FOURTH_NAME].filter(Boolean).join(' '),
    }));
    const entities = this.array(data?.ENTITIES?.ENTITY).map((entry: any) => ({
      id: entry.DATAID || entry.REFERENCE_NUMBER,
      name: entry.FIRST_NAME,
    }));
    return [...people, ...entities]
      .filter((entry) => entry.name && entry.id)
      .map((entry) => this.record(String(entry.name), 'UNSCR', String(entry.id)));
  }

  private async replace(client: PoolClient, records: SanctionRecord[], replaceSources: string[]) {
    await client.query('BEGIN');
    try {
      await client.query(
        `CREATE TEMP TABLE kyc_sanction_stage(
           normalized_name text,original_name text,source varchar(40),source_record_id varchar(150)
         ) ON COMMIT DROP`,
      );
      await client.query(
        `INSERT INTO kyc_sanction_stage(normalized_name,original_name,source,source_record_id)
         SELECT normalized_name,original_name,source,source_record_id
         FROM jsonb_to_recordset($1::jsonb) AS incoming(
           normalized_name text,original_name text,source varchar,source_record_id varchar
         )`,
        [JSON.stringify(records.map((record) => ({
          normalized_name: record.normalizedName,
          original_name: record.originalName,
          source: record.source,
          source_record_id: record.sourceRecordId,
        })))],
      );
      if (replaceSources.length) {
        await client.query(`DELETE FROM kyc.sanction_records WHERE source=ANY($1::varchar[])`, [replaceSources]);
      }
      const result = await client.query(
        `INSERT INTO kyc.sanction_records(normalized_name,original_name,source,source_record_id)
         SELECT normalized_name,original_name,source,source_record_id FROM kyc_sanction_stage
         ON CONFLICT(source,source_record_id) DO UPDATE SET
           normalized_name=EXCLUDED.normalized_name,original_name=EXCLUDED.original_name,
           updated_at=CURRENT_TIMESTAMP`,
      );
      await client.query('COMMIT');
      return result.rowCount || 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  private async startRun(client: PoolClient, mode: string, source: string, actor: string, fileName?: string, sha256?: string) {
    const { rows } = await client.query(
      `INSERT INTO kyc.sanction_sync_runs(mode,source,actor_id,file_name,file_sha256)
       VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [mode, source, actor, fileName || null, sha256 || null],
    );
    return rows[0].id as string;
  }

  private completeRun(client: PoolClient, id: string, received: number, applied: number) {
    return client.query(
      `UPDATE kyc.sanction_sync_runs SET status='COMPLETED',records_received=$2,
              records_applied=$3,completed_at=CURRENT_TIMESTAMP WHERE id=$1::uuid`,
      [id, received, applied],
    );
  }

  private failRun(client: PoolClient, id: string, error: unknown) {
    return client.query(
      `UPDATE kyc.sanction_sync_runs SET status='FAILED',error_message=$2,
              completed_at=CURRENT_TIMESTAMP WHERE id=$1::uuid`,
      [id, error instanceof Error ? error.message.slice(0, 2000) : 'Unknown failure'],
    );
  }

  private record(name: string, source: string, id: string): SanctionRecord {
    const originalName = name.replace(/\s+/g, ' ').trim().slice(0, 1000);
    const normalizedName = originalName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (!normalizedName) throw new BadRequestException('Sanctions record name cannot be normalized');
    return { normalizedName, originalName, source, sourceRecordId: id.slice(0, 150) };
  }

  private array<T>(value: T | T[] | undefined): T[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
  }
}
