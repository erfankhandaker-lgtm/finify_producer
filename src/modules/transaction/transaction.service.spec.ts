import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from './transaction.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SwViewAllUser, WalletDetail } from '@models/index';
import { KeywordService } from './keyword.service';
import { PasswordService } from './password.service';
import { ProcessTransactionService } from './process-transaction.service';
import { TransactionRequestService } from './transaction-request.service';
import { ChargeService } from './charge.service';
import { CommissionService } from './commission.service';
import { AmlTransactionService } from './aml-transaction.service';

describe('TransactionService', () => {
  let service: TransactionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        ...[KeywordService, PasswordService, ProcessTransactionService, TransactionRequestService, ChargeService, CommissionService, AmlTransactionService].map(service => ({
          provide: service,
          useValue: {},
        })),
        { provide: getRepositoryToken(SwViewAllUser), useValue: {} },
        { provide: getRepositoryToken(WalletDetail), useValue: {} },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
