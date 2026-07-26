import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

@Injectable()
export class SourceValidatorService {
  private readonly schemas: Set<string>;

  constructor(private readonly dataSource: DataSource, config: ConfigService) {
    this.schemas = new Set(
      config.get<string>('CREDIT_RULE_ALLOWED_SCHEMAS', 'public')
        .split(',').map((value) => value.trim()).filter(Boolean)
    );
  }

  async validatePostgresSource(input: {
    schemaName?: string;
    tableName?: string;
    lookupColumn?: string;
    valueColumn?: string;
    readMode?: string;
    orderByColumn?: string;
  }): Promise<void> {
    const schema = input.schemaName ?? '';
    if (!this.schemas.has(schema)) throw new BadRequestException(`Schema ${schema} is not approved`);
    if (!input.tableName || !input.lookupColumn || !input.valueColumn) {
      throw new BadRequestException('PostgreSQL rules require tableName, lookupColumn, and valueColumn');
    }
    if (input.readMode === 'LATEST' && !input.orderByColumn) {
      throw new BadRequestException('LATEST rules require orderByColumn');
    }
    const required = [input.lookupColumn,input.valueColumn, ...(input.orderByColumn ? [input.orderByColumn] : [])];
    const rows = await this.dataSource.query<Array<{ column_name: string; data_type: string }>>(
      `SELECT column_name,data_type
       FROM information_schema.columns
       WHERE table_schema=$1 AND table_name=$2 AND column_name=ANY($3::text[])`,
      [schema,input.tableName,required]
    );
    const found = new Set(rows.map((row) => row.column_name));
    const missing = required.filter((column) => !found.has(column));
    if (missing.length) throw new BadRequestException(`Unknown database columns: ${missing.join(', ')}`);
  }

  async metadata(schemaName: string, tableName?: string) {
    if (!this.schemas.has(schemaName)) throw new BadRequestException(`Schema ${schemaName} is not approved`);
    if (!tableName) {
      return this.dataSource.query(
        `SELECT table_name,table_type
         FROM information_schema.tables
         WHERE table_schema=$1
         ORDER BY table_name`,
        [schemaName]
      );
    }
    return this.dataSource.query(
      `SELECT column_name,data_type,is_nullable
       FROM information_schema.columns
       WHERE table_schema=$1 AND table_name=$2
       ORDER BY ordinal_position`,
      [schemaName,tableName]
    );
  }
}
