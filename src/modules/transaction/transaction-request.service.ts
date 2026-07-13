import { SwTblTransactionEntry, TransactionRequest } from '@models/index';
import { Injectable } from '@nestjs/common'
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CreateTransactionRequestDto, PaginationDto, UpdateTransactionRequestDto } from './dto/transaction-request.dto';
import { winstonLog } from '@config/winstonLog';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationResponse } from './entities/pagination-response.interface';
import { randomInt } from 'crypto';
@Injectable()
export  class TransactionRequestService {

    constructor(
        @InjectRepository(TransactionRequest) private readonly transactionRequestRepository: Repository<TransactionRequest>,
        @InjectRepository(SwTblTransactionEntry) private readonly transactionEntryRepository: Repository<SwTblTransactionEntry>,
    ){}

    async generateTransactionID(createTransactionDto: CreateTransactionDto){

      const transectionId = `${Date.now()}${randomInt(10000, 100000)}`;

        const ID = `${createTransactionDto.keyword}-${transectionId}`;
        return {transectionId, ID};

    }

    async   create(createTransactionDto: CreateTransactionDto){
        const transactionReq: CreateTransactionRequestDto = {
            keyword: createTransactionDto.keyword,
            sourceWalletId: createTransactionDto.sourceAccount,
            destWalletId: createTransactionDto.destinationAccount,
            amount: createTransactionDto.amount,
            destWalletFullname:'',
            pin:'',
            currency:'',
            remarks:''
 
   
          
       
          
          
        };
        const {transectionId, ID} = await this.generateTransactionID(createTransactionDto);
        winstonLog.log('info', 'Creating transaction request with ID: %s', ID);
         await this.transactionRequestRepository.save(this.transactionRequestRepository.create({
           ...transactionReq,
           sourceWalletId: createTransactionDto.sourceAccount,
           destWalletId: createTransactionDto.destinationAccount,
           TRNID: ID,
           transactionId: transectionId,
         }));
         return {transectionId, ID};
    }

    async update( updateData: UpdateTransactionRequestDto) {
        await this.transactionRequestRepository.update(
          { transactionId: updateData.transactionId },
          {
            transactionStatus: String(updateData.transactionStatus),
            feePayer: updateData.feePayer,
            commissionReceiver: updateData.commissionReceiver,
            ...(updateData.transactionFee !== undefined ? { transactionFee: updateData.transactionFee } : {}),
            ...(updateData.transactionCommission !== undefined ? { transactionComm: updateData.transactionCommission } : {}),
          },
        );
    
    }
    async findOne(transactionId: string) {
        return await this.transactionRequestRepository.findOne({
            where: { transactionId },
        });
    }
    async findAllPaginated(paginationDto: PaginationDto): Promise<PaginationResponse<SwTblTransactionEntry>> {
    const { page, limit, accountnumber } = paginationDto;
    const offset = (page - 1) * limit;

      const whereClause = {};
    if (accountnumber) {
      whereClause['accountnumber'] = accountnumber;
    }
    const [rows, count] = await this.transactionEntryRepository.findAndCount({
      skip: offset,
      take: limit,
      order: { entrydate: 'DESC' },
      where: whereClause,
    });

    const totalPages = Math.ceil(count / limit);

    return {
      data: rows,
      totalRecords: count,
      currentPage: page,
      totalPages: totalPages,
    };
  }
}
