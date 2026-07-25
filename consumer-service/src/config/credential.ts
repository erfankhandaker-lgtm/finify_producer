import { createDecipheriv } from 'crypto';

const legacyKey = '3zTvzr3p67VC61jmV54rIYu1545x4TlY';
const legacyIv = '60iP0h6vJoEa';

interface EncryptedCredential {
  content: string;
  tag: string;
}

export function readCredential(value: string | undefined, plain: boolean): string | undefined {
  if (!value || plain) {
    return value;
  }

  try {
    const encrypted = JSON.parse(value) as EncryptedCredential;
    const key = process.env.CREDENTIAL_ENCRYPTION_KEY || legacyKey;
    const iv = process.env.CREDENTIAL_ENCRYPTION_IV || legacyIv;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
    return decipher.update(encrypted.content, 'hex', 'utf8') + decipher.final('utf8');
  } catch {
    return value;
  }
}
