import * as crypto from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PasswordService } from './password.service';

describe('PasswordService wallet PIN hashing', () => {
  const query = jest.fn();
  const service = new PasswordService({ query } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    (service as any).secret = 'legacy-test-secret';
    query.mockResolvedValue([]);
  });

  it('stores new PINs as an adaptive bcrypt hash', async () => {
    const hash = await service.encryptPassword('1234', '447700900001');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await bcrypt.compare('1234', hash)).toBe(true);
    expect(query).toHaveBeenCalledWith(
      "select * from walletpindetail ($1, 'UpdateWalletPin', $2)",
      ['447700900001', hash],
    );
  });

  it('accepts a legacy HMAC once and immediately rehashes it', async () => {
    const legacy = crypto.createHmac('sha256', 'legacy-test-secret').update('1234').digest('hex');
    await expect(service.verifyPassword('1234', legacy, '447700900001')).resolves.toBe(true);
    const update = query.mock.calls.find((call) => call[0].includes('UpdateWalletPin'));
    expect(update?.[1]?.[1]).toMatch(/^\$2[aby]\$12\$/);
  });

  it('rejects an incorrect bcrypt PIN', async () => {
    const hash = await bcrypt.hash('1234', 12);
    await expect(service.verifyPassword('9999', hash, '447700900001')).resolves.toBe(false);
    expect(query).toHaveBeenCalledWith(
      "select * from walletpindetail ($1, 'FailedWalletPin')",
      ['447700900001'],
    );
  });
});

