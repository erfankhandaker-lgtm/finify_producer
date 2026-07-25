export type MerchantConfirmationDecision = 'APPROVED' | 'REJECTED' | 'UNKNOWN';

export interface MerchantConfirmation {
  decision: MerchantConfirmationDecision;
  code?: string;
  message?: string;
}

const APPROVED_VALUES = new Set(['APPROVED', 'SUCCESS', 'SUCCESSFUL', 'CONFIRMED', 'COMPLETED', 'OK', '00', '0', '200']);
const REJECTED_VALUES = new Set(['REJECTED', 'DECLINED', 'DENIED', 'FAILED', 'FAILURE', 'CANCELLED', 'CANCELED']);

export function interpretMerchantConfirmation(httpStatus: number, body: unknown): MerchantConfirmation {
  const candidates = collectCandidates(body);
  const code = readString(candidates, ['responseCode', 'response_code', 'code', 'statusCode']);
  const message = readString(candidates, ['message', 'responseMessage', 'description', 'detail']);
  const status = readString(candidates, ['status', 'transactionStatus', 'decision', 'result']);
  const booleanDecision = readBoolean(candidates, ['approved', 'confirmed', 'success', 'accepted']);

  if (booleanDecision === true) {
    return { decision: 'APPROVED', code, message };
  }
  if (booleanDecision === false) {
    return { decision: 'REJECTED', code, message };
  }

  for (const value of [status, code]) {
    const normalized = value?.trim().toUpperCase();
    if (normalized && APPROVED_VALUES.has(normalized)) {
      return { decision: 'APPROVED', code, message };
    }
    if (normalized && REJECTED_VALUES.has(normalized)) {
      return { decision: 'REJECTED', code, message };
    }
  }

  if (httpStatus >= 500 || httpStatus === 408 || httpStatus === 429) {
    return { decision: 'UNKNOWN', code, message: message ?? `Merchant API returned HTTP ${httpStatus}` };
  }

  return { decision: 'UNKNOWN', code, message: message ?? 'Merchant response did not contain an explicit decision' };
}

function collectCandidates(body: unknown): Record<string, unknown>[] {
  if (!isObject(body)) {
    return [];
  }

  const candidates = [body];
  for (const key of ['data', 'result', 'response']) {
    const nested = body[key];
    if (isObject(nested)) {
      candidates.push(nested);
    }
  }
  return candidates;
}

function readString(candidates: Record<string, unknown>[], keys: string[]): string | undefined {
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === 'string' || typeof value === 'number') {
        return String(value);
      }
    }
  }
  return undefined;
}

function readBoolean(candidates: Record<string, unknown>[], keys: string[]): boolean | undefined {
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string' && ['TRUE', 'FALSE'].includes(value.toUpperCase())) {
        return value.toUpperCase() === 'TRUE';
      }
    }
  }
  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
