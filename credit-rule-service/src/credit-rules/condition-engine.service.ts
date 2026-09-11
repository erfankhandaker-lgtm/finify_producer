import { BadRequestException, Injectable } from '@nestjs/common';
import { ConditionGroup, ConditionLeaf, ConditionNode, DataType, RuleAction } from './credit-rule.types';

@Injectable()
export class ConditionEngineService {
  validate(condition: unknown, depth = 0): asserts condition is ConditionNode {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
      throw new BadRequestException('A condition must be an object');
    }
    if (depth > 8) throw new BadRequestException('Condition nesting may not exceed 8 levels');
    const node = condition as Record<string, unknown>;
    const groups = ['all', 'any', 'not'].filter((key) => node[key] !== undefined);
    if (groups.length) {
      if (groups.length !== 1) throw new BadRequestException('A condition group must use exactly one of all, any, or not');
      if (groups[0] === 'not') return this.validate(node.not, depth + 1);
      const children = node[groups[0]];
      if (!Array.isArray(children) || children.length < 1 || children.length > 50) {
        throw new BadRequestException(`${groups[0]} must contain between 1 and 50 conditions`);
      }
      for (const child of children) this.validate(child, depth + 1);
      return;
    }
    const allowed = new Set([
      'EQUALS','NOT_EQUALS','GREATER_THAN','GREATER_THAN_OR_EQUAL',
      'LESS_THAN','LESS_THAN_OR_EQUAL','BETWEEN','RANGE','IN','NOT_IN','IS_NULL','IS_NOT_NULL'
    ]);
    if (!allowed.has(String(node.operator))) throw new BadRequestException(`Unsupported condition operator ${node.operator}`);
    if (['BETWEEN','RANGE'].includes(String(node.operator))) {
      const lower = Number(node.lowerValue);
      const upper = Number(node.upperValue);
      if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower >= upper) {
        throw new BadRequestException('A range requires numeric lowerValue < upperValue');
      }
    }
    if (['IN','NOT_IN'].includes(String(node.operator)) && !Array.isArray(node.values)) {
      throw new BadRequestException(`${node.operator} requires values`);
    }
  }

  validateAction(action: unknown): asserts action is RuleAction {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw new BadRequestException('A rule action must be an object');
    }
    const candidate = action as Record<string, unknown>;
    const allowed = new Set([
      'CONTINUE','REJECT','MANUAL_REVIEW','SET_LIMIT_FIXED','SET_LIMIT_FROM_VALUE',
      'SET_LIMIT_FROM_VALUE_MULTIPLIER','ADD_LIMIT_FIXED','SUBTRACT_LIMIT_FIXED',
      'CAP_LIMIT_FIXED','CAP_LIMIT_FROM_VALUE_MULTIPLIER','SET_CREDIT_OFFER','SET_LIMIT_FROM_INPUT_MULTIPLIER'
    ]);
    if (!allowed.has(String(candidate.type))) throw new BadRequestException(`Unsupported rule action ${candidate.type}`);
    const numericTypes = new Set([
      'SET_LIMIT_FIXED','ADD_LIMIT_FIXED','SUBTRACT_LIMIT_FIXED','CAP_LIMIT_FIXED'
    ]);
    if (numericTypes.has(String(candidate.type)) && !Number.isFinite(Number(candidate.value))) {
      throw new BadRequestException(`${candidate.type} requires a numeric value`);
    }
    const multiplierTypes = new Set(['SET_LIMIT_FROM_VALUE_MULTIPLIER','CAP_LIMIT_FROM_VALUE_MULTIPLIER']);
    if (multiplierTypes.has(String(candidate.type)) && !Number.isFinite(Number(candidate.multiplier))) {
      throw new BadRequestException(`${candidate.type} requires a numeric multiplier`);
    }
    if (candidate.type === 'SET_CREDIT_OFFER' && !Number.isFinite(Number(candidate.limit))) {
      throw new BadRequestException('SET_CREDIT_OFFER requires a numeric limit');
    }
    if (candidate.type === 'SET_LIMIT_FROM_INPUT_MULTIPLIER') {
      if (!candidate.inputField || typeof candidate.inputField !== 'string') {
        throw new BadRequestException('SET_LIMIT_FROM_INPUT_MULTIPLIER requires inputField');
      }
      if (!Number.isFinite(Number(candidate.multiplier))) {
        throw new BadRequestException('SET_LIMIT_FROM_INPUT_MULTIPLIER requires a numeric multiplier');
      }
    }
    if (candidate.repaymentOptionIds !== undefined
      && (!Array.isArray(candidate.repaymentOptionIds)
        || candidate.repaymentOptionIds.some((value) => typeof value !== 'string'))) {
      throw new BadRequestException('repaymentOptionIds must be an array of strings');
    }
  }

  evaluate(condition: ConditionNode, rawValue: unknown, dataType: DataType): boolean {
    if (this.isGroup(condition)) {
      if (condition.all) return condition.all.every((child) => this.evaluate(child, rawValue, dataType));
      if (condition.any) return condition.any.some((child) => this.evaluate(child, rawValue, dataType));
      if (condition.not) return !this.evaluate(condition.not, rawValue, dataType);
    }
    const leaf = condition as ConditionLeaf;
    if (leaf.field) rawValue = this.readField(rawValue,leaf.field);
    dataType = leaf.dataType ?? dataType;
    if (leaf.operator === 'IS_NULL') return rawValue === null || rawValue === undefined;
    if (leaf.operator === 'IS_NOT_NULL') return rawValue !== null && rawValue !== undefined;
    const actual = this.coerce(rawValue, dataType);
    if (leaf.operator === 'IN' || leaf.operator === 'NOT_IN') {
      const contains = (leaf.values ?? []).some((value) => this.compare(actual, this.coerce(value, dataType)) === 0);
      return leaf.operator === 'IN' ? contains : !contains;
    }
    if (leaf.operator === 'BETWEEN' || leaf.operator === 'RANGE') {
      const lower = this.coerce(leaf.lowerValue, dataType);
      const upper = this.coerce(leaf.upperValue, dataType);
      const lowerResult = this.compare(actual, lower);
      const upperResult = this.compare(actual, upper);
      const lowerOk = leaf.operator === 'BETWEEN' || leaf.lowerInclusive !== false ? lowerResult >= 0 : lowerResult > 0;
      const upperOk = leaf.operator === 'BETWEEN' || leaf.upperInclusive !== false ? upperResult <= 0 : upperResult < 0;
      return lowerOk && upperOk;
    }
    const expected = this.coerce(leaf.value, dataType);
    const result = this.compare(actual, expected);
    switch (leaf.operator) {
      case 'EQUALS': return result === 0;
      case 'NOT_EQUALS': return result !== 0;
      case 'GREATER_THAN': return result > 0;
      case 'GREATER_THAN_OR_EQUAL': return result >= 0;
      case 'LESS_THAN': return result < 0;
      case 'LESS_THAN_OR_EQUAL': return result <= 0;
      default: return false;
    }
  }

  coerce(value: unknown, dataType: DataType): unknown {
    if (value === null || value === undefined) return value;
    switch (dataType) {
      case 'DECIMAL':
      case 'INTEGER': {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error(`Value ${String(value)} is not numeric`);
        return dataType === 'INTEGER' ? Math.trunc(number) : number;
      }
      case 'BOOLEAN':
        if (typeof value === 'boolean') return value;
        if (['true','1','yes','y'].includes(String(value).trim().toLowerCase())) return true;
        if (['false','0','no','n'].includes(String(value).trim().toLowerCase())) return false;
        throw new Error(`Value ${String(value)} is not boolean`);
      case 'DATE':
      case 'DATETIME': {
        const epoch = new Date(String(value)).getTime();
        if (!Number.isFinite(epoch)) throw new Error(`Value ${String(value)} is not a date`);
        return epoch;
      }
      default: return String(value);
    }
  }

  private compare(left: unknown, right: unknown): number {
    if (left === right) return 0;
    if (left === null || left === undefined) return -1;
    if (right === null || right === undefined) return 1;
    return left < right ? -1 : 1;
  }

  private isGroup(node: ConditionNode): node is ConditionGroup {
    return 'all' in node || 'any' in node || 'not' in node;
  }

  private readField(value: unknown,path: string): unknown {
    return path.split('.').filter(Boolean).reduce<unknown>((current,key) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string,unknown>)[key];
    },value);
  }
}
