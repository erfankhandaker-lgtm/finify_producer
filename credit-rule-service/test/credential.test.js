const assert = require('node:assert/strict');
const test = require('node:test');
const { createCipheriv } = require('node:crypto');
const { readCredential } = require('../dist/config/credential');

test('reads plain credentials unchanged', () => {
  assert.equal(readCredential('database-user', true), 'database-user');
});

test('decrypts the repository AES-GCM credential format', () => {
  const previousKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  const previousIv = process.env.CREDENTIAL_ENCRYPTION_IV;
  const key = Buffer.from('12345678901234567890123456789012');
  const iv = Buffer.from('123456789012');
  process.env.CREDENTIAL_ENCRYPTION_KEY = key.toString();
  process.env.CREDENTIAL_ENCRYPTION_IV = iv.toString();

  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const content = cipher.update('secret-value', 'utf8', 'hex') + cipher.final('hex');
    const encrypted = JSON.stringify({
      content,
      tag: cipher.getAuthTag().toString('hex')
    });
    assert.equal(readCredential(encrypted, false), 'secret-value');
  } finally {
    if (previousKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = previousKey;
    if (previousIv === undefined) delete process.env.CREDENTIAL_ENCRYPTION_IV;
    else process.env.CREDENTIAL_ENCRYPTION_IV = previousIv;
  }
});
