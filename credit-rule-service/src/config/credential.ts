import { createDecipheriv } from 'node:crypto';

export function readCredential(value: string | undefined, plain: boolean): string {
  if (!value || plain) return value ?? '';
  const key = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY ?? '', 'hex');
  const iv = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_IV ?? '', 'hex');
  if (![16, 24, 32].includes(key.length) || iv.length !== 16) {
    throw new Error('Encrypted credentials require a valid hex CREDENTIAL_ENCRYPTION_KEY and 16-byte IV');
  }
  const decipher = createDecipheriv(`aes-${key.length * 8}-cbc`, key, iv);
  return Buffer.concat([decipher.update(Buffer.from(value, 'base64')), decipher.final()]).toString('utf8');
}
