import { BadRequestException, Injectable } from '@nestjs/common';
import { FieldMappingDto } from './integration.dto';
import { MappedRequest, MappingContext } from './integration.types';

@Injectable()
export class FieldMappingService {
  map(mappings: FieldMappingDto[], context: MappingContext): MappedRequest {
    const result: MappedRequest = { body: {}, headers: {}, query: {}, path: {} };
    for (const mapping of mappings) {
      let value = mapping.source === 'literalValue'
        ? mapping.literalValue
        : this.readPath(context as unknown as Record<string, unknown>, mapping.source);
      if (value === undefined || value === null || value === '') {
        value = mapping.defaultValue;
      }
      if ((value === undefined || value === null) && mapping.required) {
        throw new BadRequestException(`Required integration mapping source ${mapping.source} has no value`);
      }
      if (value === undefined) {
        continue;
      }
      const converted = this.convert(value, mapping.type ?? 'raw', mapping.source);
      const location = mapping.location ?? 'body';
      if (location === 'body' || location === 'message') {
        this.writePath(result.body, mapping.target, converted);
      } else {
        const scalar = typeof converted === 'string' ? converted : JSON.stringify(converted);
        const target = location === 'header' ? result.headers : result[location];
        target[mapping.target] = scalar;
      }
    }
    return result;
  }

  resolve(source: string | null, context: MappingContext): string | undefined {
    if (!source) {
      return undefined;
    }
    const value = this.readPath(context as unknown as Record<string, unknown>, source);
    return value === undefined || value === null ? undefined : String(value);
  }

  readPath(source: Record<string, unknown>, path: string): unknown {
    return path.split('.').filter(Boolean).reduce<unknown>((current, segment) => {
      if (typeof current !== 'object' || current === null || Array.isArray(current)) {
        return undefined;
      }
      return (current as Record<string, unknown>)[segment];
    }, source);
  }

  private writePath(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.').filter(Boolean);
    if (parts.length === 0) {
      throw new BadRequestException('Integration mapping target cannot be empty');
    }
    let current = target;
    for (const part of parts.slice(0, -1)) {
      const existing = current[part];
      if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }

  private convert(value: unknown, type: NonNullable<FieldMappingDto['type']>, source: string): unknown {
    switch (type) {
      case 'string': return String(value);
      case 'number': {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new BadRequestException(`${source} is not a valid number`);
        return number;
      }
      case 'decimal': {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new BadRequestException(`${source} is not a valid decimal`);
        return number.toFixed(2);
      }
      case 'boolean': {
        if (typeof value === 'boolean') return value;
        if (String(value).toLowerCase() === 'true') return true;
        if (String(value).toLowerCase() === 'false') return false;
        throw new BadRequestException(`${source} is not a valid boolean`);
      }
      default: return value;
    }
  }
}
