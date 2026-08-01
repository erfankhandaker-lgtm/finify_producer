'use strict';

const http = require('node:http');
const { randomUUID } = require('node:crypto');

const port = Number(process.env.MOCK_MERCHANT_PORT || 5010);
const requests = [];
const decisions = new Map();

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) request.destroy();
    });
    request.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
    });
    request.on('error', reject);
  });
}

function requestedDecision(body) {
  const reference = String(body.reference || body.referenceId || '').toUpperCase();
  if (reference.includes('TIMEOUT')) return 'TIMEOUT';
  if (reference.includes('REJECT') || reference.includes('NEGATIVE')) return 'REJECTED';
  return 'APPROVED';
}

function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://mock-merchant');
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, {
        status: 'ok',
        service: 'finify-mock-merchant',
        receivedRequests: requests.length,
      });
    }
    if (request.method === 'GET' && url.pathname === '/requests') {
      return json(response, 200, { data: requests.slice().reverse() });
    }
    if (request.method === 'DELETE' && url.pathname === '/requests') {
      requests.length = 0;
      decisions.clear();
      return json(response, 200, { cleared: true });
    }
    if (request.method !== 'POST' || url.pathname !== '/payments') {
      return json(response, 404, { status: 'NOT_FOUND' });
    }

    try {
      const body = await readJson(request);
      const finify = body._finify || {};
      const idempotencyKey = String(request.headers['idempotency-key'] || finify.idempotencyKey || '');
      const previous = decisions.get(idempotencyKey);
      if (previous) return json(response, previous.httpStatus, { ...previous.body, idempotent: true });

      const decision = requestedDecision(body);
      const audit = {
        receivedAt: new Date().toISOString(),
        correlationId: request.headers['x-finify-correlation-id'] || finify.correlationId,
        transactionId: request.headers['x-finify-transaction-id'] || finify.transactionId,
        idempotencyKey,
        reference: body.reference || body.referenceId,
        amount: body.amount,
        decision,
      };
      requests.push(audit);

      if (decision === 'TIMEOUT') {
        const delay = Number(process.env.MOCK_MERCHANT_TIMEOUT_DELAY_MS || 5000);
        return setTimeout(() => json(response, 504, {
          decision: 'REJECTED',
          code: 'MOCK_TIMEOUT',
          message: 'Mock merchant timed out',
        }), delay);
      }

      const responseBody = {
        decision,
        code: decision === 'APPROVED' ? '00' : '51',
        message: decision === 'APPROVED' ? 'Mock merchant approved payment' : 'Mock merchant rejected payment',
        externalReference: `MOCK-${randomUUID()}`,
      };
      const httpStatus = decision === 'APPROVED' ? 200 : 422;
      decisions.set(idempotencyKey, { httpStatus, body: responseBody });
      return json(response, httpStatus, responseBody);
    } catch {
      return json(response, 400, { decision: 'REJECTED', code: 'INVALID_JSON', message: 'Invalid request body' });
    }
  });
}

if (require.main === module) createServer().listen(port, '0.0.0.0');

module.exports = { createServer, requestedDecision };
