import { Injectable } from '@nestjs/common';

@Injectable()
export class CsvReportService {
  serialize(rows: Array<Record<string, unknown>>) {
    if (!rows.length) return '';
    const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const escape = (value: unknown) => {
      if (value === null || value === undefined) return '';
      const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [
      columns.map(escape).join(','),
      ...rows.map(row => columns.map(column => escape(row[column])).join(',')),
    ].join('\r\n');
  }
}
