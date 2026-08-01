import { TreasuryDocumentService } from './treasury-document.service';

const file = (
  mimetype: string,
  buffer: Buffer,
  originalname = 'statement.pdf',
) => ({
  fieldname: 'file',
  originalname,
  encoding: '7bit',
  mimetype,
  size: buffer.length,
  buffer,
  destination: '',
  filename: '',
  path: '',
  stream: undefined as any,
}) as Express.Multer.File;

describe('TreasuryDocumentService', () => {
  const config = {
    get: jest.fn((key: string) => ({
      MINIO_ENDPOINT: '127.0.0.1',
      MINIO_PORT: '9000',
      MINIO_USE_SSL: 'false',
      MINIO_ACCESS_KEY: 'test-access',
      MINIO_SECRET_KEY: 'test-secret',
      MINIO_TREASURY_BUCKET: 'treasury-test',
    })[key]),
  };

  it('rejects a file whose bytes do not match its declared type', async () => {
    const service = new TreasuryDocumentService({} as any, config as any);
    await expect(
      service.upload(file('application/pdf', Buffer.from('not a pdf')), 'maker'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'Only genuine PDF, PNG, or JPEG documents are allowed',
      }),
    });
  });

  it('uploads a genuine PDF using a generated private object key and checksum', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{
        id: '12',
        originalName: 'bank_statement.pdf',
        contentType: 'application/pdf',
        sizeBytes: '13',
        sha256: 'digest',
        status: 'UPLOADED',
      }]),
    };
    const service = new TreasuryDocumentService(dataSource as any, config as any);
    const client = (service as any).client;
    jest.spyOn(client, 'putObject').mockResolvedValue({ etag: 'etag', versionId: null });
    jest.spyOn(client, 'removeObject').mockResolvedValue(undefined);
    const document = file(
      'application/pdf',
      Buffer.from('%PDF-1.7 test'),
      'bank<>statement.pdf',
    );

    await expect(service.upload(document, 'maker')).resolves.toMatchObject({
      id: '12',
      evidenceReference: 'MINIO_DOCUMENT:12',
    });
    const objectKey = client.putObject.mock.calls[0][1];
    expect(objectKey).toMatch(/^treasury\/\d{4}\/\d{2}\/.+\.pdf$/);
    expect(dataSource.query.mock.calls[0][1][2]).toBe('bank__statement.pdf');
    expect(dataSource.query.mock.calls[0][1][5]).toMatch(/^[a-f0-9]{64}$/);
  });
});
