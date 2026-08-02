import { MrFinifyService } from './mr-finify.service';
import { AdminTokenPayload } from '../admin-auth/admin-auth.types';

const user = (roles: string[], permissions: string[]): AdminTokenPayload => ({
  sub: '7',
  sid: 'session-7',
  username: 'operator',
  roles,
  permissions,
  type: 'admin_access',
});

describe('MrFinifyService', () => {
  const queries: Array<{ sql: string; parameters: unknown[] }> = [];
  const dataSource = {
    query: jest.fn(async (sql: string, parameters: unknown[] = []) => {
      queries.push({ sql, parameters });
      if (sql.includes('count(*)::int AS count')) return [{ count: 0 }];
      return [];
    }),
    transaction: jest.fn(),
  };
  const config = { get: jest.fn(() => undefined) };
  const operations = {};
  let service: MrFinifyService;

  beforeEach(() => {
    queries.length = 0;
    dataSource.query.mockClear();
    dataSource.transaction.mockClear();
    config.get.mockClear();
    service = new MrFinifyService(dataSource as never, config as never, operations as never);
  });

  afterEach(() => {
    delete process.env.FINIFY_SECRET_ENCRYPTION_KEY;
  });

  it('gives super administrators the complete read-only tool catalogue', async () => {
    const status = await service.status(user(['super_admin'], []));

    expect(status.accessScope).toBe('SUPERADMIN');
    expect(status.tools).toEqual(expect.arrayContaining([
      'search_customers',
      'search_transactions',
      'get_accounting_report',
      'search_admin_directory',
    ]));
    expect(status.writeToolsEnabled).toBe(false);
  });

  it('limits an operator tool catalogue to assigned permissions', async () => {
    const status = await service.status(user(['operations'], ['assistant.use', 'customers.read']));

    expect(status.accessScope).toBe('ROLE_SCOPED');
    expect(status.tools).toContain('search_customers');
    expect(status.tools).not.toContain('search_transactions');
    expect(status.tools).not.toContain('get_accounting_report');
    expect(status.tools).not.toContain('search_admin_directory');
  });

  it('returns a controlled response and audits when the API key is absent', async () => {
    const result = await service.chat({ message: 'Show the system status', history: [] }, user(['super_admin'], []));

    expect(result.configured).toBe(false);
    expect(result.message).toContain('Configuration');
    expect(dataSource.query).toHaveBeenCalledTimes(3);
    expect(queries[2].sql).toContain('INSERT INTO public.mr_finify_interactions');
    expect(queries[2].parameters).toContain('UNCONFIGURED');
  });

  it('decrypts a database API key without returning it from configuration', async () => {
    process.env.FINIFY_SECRET_ENCRYPTION_KEY = 'test-only-secret-encryption-root';
    const encrypted = (service as any).encryptSecret('sk-test-write-only-value-1234567890');
    dataSource.query.mockImplementationOnce(async () => ([{
      api_key_ciphertext: encrypted.ciphertext,
      api_key_iv: encrypted.iv,
      api_key_auth_tag: encrypted.authTag,
      model: 'gpt-5.6-sol',
      rate_limit_per_minute: 25,
      updated_at: new Date('2026-08-02T09:00:00Z'),
      updated_by: '1',
    }] as any));

    const configuration = await service.configuration();

    expect(configuration).toMatchObject({
      configured: true,
      apiKeySource: 'SECURE_DATABASE',
      apiKeyWriteOnly: true,
      rateLimitPerMinute: 25,
    });
    expect(JSON.stringify(configuration)).not.toContain('sk-test');
  });

  it('stores a new API key encrypted and audits only non-secret metadata', async () => {
    process.env.FINIFY_SECRET_ENCRYPTION_KEY = 'test-only-secret-encryption-root';
    const rawKey = 'sk-test-write-only-value-1234567890';
    let updateParameters: any[] = [];
    const manager = {
      query: jest.fn(async (sql: string, parameters: any[] = []) => {
        if (sql.includes('FOR UPDATE')) return [{ api_key_ciphertext: null }];
        if (sql.includes('UPDATE public.mr_finify_settings')) updateParameters = parameters;
        return [];
      }),
    };
    dataSource.transaction.mockImplementationOnce(async (work: any) => work(manager));
    dataSource.query.mockImplementationOnce(async () => ([{
      api_key_ciphertext: updateParameters[2],
      api_key_iv: updateParameters[3],
      api_key_auth_tag: updateParameters[4],
      model: 'gpt-5.6-sol',
      rate_limit_per_minute: 20,
      updated_by: '7',
      updated_at: new Date(),
    }] as any));

    const result = await service.updateConfiguration({
      apiKey: rawKey,
      model: 'gpt-5.6-sol',
      rateLimitPerMinute: 20,
    }, user(['super_admin'], ['assistant.configure']));

    expect(result).toMatchObject({ configured: true, apiKeySource: 'SECURE_DATABASE' });
    expect(updateParameters[2]).not.toBe(rawKey);
    expect(updateParameters[3]).toBeTruthy();
    expect(updateParameters[4]).toBeTruthy();
    expect(JSON.stringify(manager.query.mock.calls)).not.toContain(rawKey);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('mr_finify_configuration_audit'),
      ['UPDATED', 'gpt-5.6-sol', 20, true, '7'],
    );
  });

  it('rejects model identifiers outside the cost-controlled catalogue', async () => {
    await expect(service.updateConfiguration({
      model: 'unapproved-expensive-model' as any,
      rateLimitPerMinute: 20,
    }, user(['super_admin'], ['assistant.configure']))).rejects.toThrow(
      'Select a supported Mr. Finify model',
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
