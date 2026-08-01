import { Injectable } from '@nestjs/common';
import { BalanceCheckDto, CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { KeywordService } from './keyword.service';
import { winstonLog } from '../../config/winstonLog';
import { SwTblTransactionEntry, SwViewAllUser, WalletDetail } from '@models/index';
import { PasswordService } from './password.service';
import { ProcessTransactionService } from './process-transaction.service';
import { TransactionRequestService } from './transaction-request.service';
import { PaginationDto, UpdateTransactionRequestDto } from './dto/transaction-request.dto';
import { createApiPropertyDecorator } from '@nestjs/swagger/dist/decorators/api-property.decorator';
import { Transaction } from './entities/transaction.entity';
import { PaginationResponse } from './entities/pagination-response.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChargeService } from './charge.service';
import { CommissionService } from './commission.service';
import { AmlTransactionService } from './aml-transaction.service';
@Injectable()
export class TransactionService {
  constructor(
    private readonly keywordService: KeywordService,
    @InjectRepository(SwViewAllUser) private readonly swViewAllUserRepository: Repository<SwViewAllUser>,
    private readonly passwordService: PasswordService,
    private readonly processTransactionService: ProcessTransactionService,
    private readonly transactionRequestService: TransactionRequestService,
    @InjectRepository(WalletDetail) private readonly walletDetailRepository: Repository<WalletDetail>,
    private readonly chargeService: ChargeService,
    private readonly commissionService: CommissionService,
    private readonly amlTransactionService: AmlTransactionService,
  ) {}
  create(createTransactionDto: CreateTransactionDto) {
    return 'This action adds a new transaction';
  }

  findAll() {
    return `This action returns all transaction`;
  }

  findOne(id: number) {
    return `This action returns a #${id} transaction`;
  }

  update(id: number, updateTransactionDto: UpdateTransactionDto) {
    return `This action updates a #${id} transaction`;
  }

  remove(id: number) {
    return `This action removes a #${id} transaction`;
  }
  async balanceCheck(balanceCheckDto: BalanceCheckDto) {
    return this.walletDetailRepository.findOne({ where: { walletMsisdn: balanceCheckDto.accountId } });
  }
  async transactionprocess(createTransactionDto: CreateTransactionDto) {
    // Create a transaction request on SW_TBL_TRANSACTION_REQUEST
    const transactionRequest = await this.transactionRequestService.create(createTransactionDto);
    const keyworddto = {keyword:createTransactionDto.keyword, sourceaccount:createTransactionDto.sourceAccount, destinationaccount:createTransactionDto.destinationAccount, amount:createTransactionDto.amount} ;

    //verifying keyword
    const keywordResponse: any = await this.keywordService.checkkeyword(keyworddto);

      if (keywordResponse.ResponseCode !== 200) {
        await this.markTransactionFailed(transactionRequest.transectionId);
        return keywordResponse;
      }
      const amlResult = keywordResponse.AMLCHECK?.[0];
      if (!amlResult) {
        await this.markTransactionFailed(transactionRequest.transectionId);
        return { Responsecode: 422, ResponseDescription: 'Keyword is not eligible for financial transaction processing' };
      }
    if(amlResult.code === 100){
      winstonLog.log('info', 'AML Check passed for transaction');
      winstonLog.log('info', 'Keyword response: %s', JSON.stringify(keywordResponse.SourceDetails));
      const [userDetails, destinationuser] = await Promise.all([
        this.swViewAllUserRepository.findOne({ where: { MSISDN: createTransactionDto.sourceAccount } }),
        this.swViewAllUserRepository.findOne({ where: { MSISDN: createTransactionDto.destinationAccount } }),
      ]);
      if(!userDetails){
        await this.markTransactionFailed(transactionRequest.transectionId);
        return {Responsecode: 404, ResponseDescription: 'Source user not found'};
      }
      if (!destinationuser) {
        await this.markTransactionFailed(transactionRequest.transectionId);
        return { Responsecode: 404, ResponseDescription: 'Destination user not found' };
      }
      winstonLog.log('info', 'User details: %s', JSON.stringify(userDetails));
      const passwordVerificationResult = await this.passwordService.PINVerify(createTransactionDto.pin, createTransactionDto.mobileNumber);
      if (!passwordVerificationResult.Passwordmatch) {
        await this.markTransactionFailed(transactionRequest.transectionId);
        winstonLog.log('error', 'Password verification failed for transaction');
        return { Responsecode: 401, ResponseDescription: 'Password verification failed' };
      }
      else{
        const sourceWalletType = Number(userDetails.Wallet_Code);
        const destinationWalletType = Number(destinationuser.Wallet_Code);
        if (
          !Number.isInteger(sourceWalletType) ||
          sourceWalletType <= 0 ||
          !Number.isInteger(destinationWalletType) ||
          destinationWalletType <= 0
        ) {
          await this.markTransactionFailed(transactionRequest.transectionId);
          return {
            Responsecode: 422,
            ResponseDescription:
              'Source and destination wallet types are required for pricing',
          };
        }
        let chargepay = '';
        let commission = '';
        let chargeid = 0;
        let commissionid = 0;
        let chargeResult = null;
        let commissionResult = null;
        const isChargeable = String(keywordResponse.keywordExists.chargeable || 'N').trim().toUpperCase() === 'Y';
        if (isChargeable) {
          const chargeLookupUser = keywordResponse.keywordExists.kcIdLookup === 'S' ? userDetails : destinationuser;
          const walletId = Number(chargeLookupUser.Wallet_Code);
          if (!Number.isInteger(walletId) || walletId <= 0) {
            await this.markTransactionFailed(transactionRequest.transectionId);
            return { Responsecode: 422, ResponseDescription: 'Valid wallet ID is required for charge calculation' };
          }
          try {
            chargeResult = await this.chargeService.calculate({
              transactionId: transactionRequest.transectionId,
              keyword: createTransactionDto.keyword,
              walletId,
              sourceWalletType,
              destinationWalletType,
              currency: transactionRequest.currency,
              amount: String(createTransactionDto.amount),
            });
          } catch (error) {
            await this.markTransactionFailed(transactionRequest.transectionId);
            throw error;
          }
          chargepay = chargeResult.payer === 'S' ? createTransactionDto.sourceAccount : createTransactionDto.destinationAccount;
          chargeid = chargeResult.chargeId;
        }
        const isCommissionable = String(keywordResponse.keywordExists.commissionable || 'N').trim().toUpperCase() === 'Y';
        if (isCommissionable) {
          const lookupUser = keywordResponse.keywordExists.kcmIdLookup === 'S' ? userDetails : destinationuser;
          const walletId = Number(lookupUser.Wallet_Code);
          if (!Number.isInteger(walletId) || walletId <= 0) {
            await this.markTransactionFailed(transactionRequest.transectionId);
            return { Responsecode: 422, ResponseDescription: 'Valid wallet ID is required for commission calculation' };
          }
          try {
            commissionResult = await this.commissionService.calculate({
              transactionId: transactionRequest.transectionId,
              keyword: createTransactionDto.keyword,
              walletId,
              sourceWalletType,
              destinationWalletType,
              currency: transactionRequest.currency,
              amount: String(createTransactionDto.amount),
            });
          } catch (error) {
            await this.markTransactionFailed(transactionRequest.transectionId);
            throw error;
          }
          commission = commissionResult.receiver === 'S' ? createTransactionDto.sourceAccount : createTransactionDto.destinationAccount;
          commissionid = commissionResult.commissionId;
        }

        let amlReservation = null;
        if (keywordResponse.keywordExists.isSystemKeyword !== true) {
          try {
            amlReservation = await this.amlTransactionService.reserve({
              transactionId: transactionRequest.transectionId,
              sourceWallet: createTransactionDto.sourceAccount,
              keyword: createTransactionDto.keyword,
              amount: Number(createTransactionDto.amount),
            });
          } catch (error) {
            await this.markTransactionFailed(transactionRequest.transectionId);
            winstonLog.log(
              'error',
              'AML reservation failed for transaction %s: %s',
              transactionRequest.transectionId,
              error instanceof Error ? error.message : String(error),
            );
            throw error;
          }
          if (!amlReservation.success) {
            await this.markTransactionFailed(transactionRequest.transectionId);
            winstonLog.log(
              'warn',
              'AML reservation rejected transaction %s: %s',
              transactionRequest.transectionId,
              amlReservation.statusCode,
            );
            return {
              Responsecode: 980,
              ResponseDescription: amlReservation.statusMessage,
              AMLCode: amlReservation.statusCode,
              TransactionID: transactionRequest.transectionId,
            };
          }
        }

        const update: UpdateTransactionRequestDto = {
          transactionId: transactionRequest.transectionId,
          feePayer: chargepay || '0',
          commissionReceiver: commission || '0',
          transactionFee: chargeResult?.chargeAmount || '0.00',
          transactionCommission: commissionResult?.commissionAmount || '0.00',
          transactionStatus: BigInt(2),
        };
        const message = {Source:createTransactionDto.sourceAccount,
          Destination:createTransactionDto.destinationAccount,
          Amount:createTransactionDto.amount,Serice:createTransactionDto.keyword,
          Currency:transactionRequest.currency,
          SourceBalance:userDetails.Amount,
          CHARGERULE:chargeid,
          CHARGEDETAILID: chargeResult?.chargeDetailId || 0,
          CHARGEAMOUNT: chargeResult?.chargeAmount || '0.00',
          CHARGEWALLET: chargeResult?.chargeWallet?.walletMsisdn || '',
          CHARGEWALLETCODE: chargeResult?.chargeWallet?.walletCode || 0,
          CHARGEWALLETCREDIT: chargeResult?.chargeWallet?.creditAmount || '0.00',
          COMMISIONRULE:commissionid,
          COMMISSIONDETAILID: commissionResult?.commissionDetailId || 0,
          COMMISSIONAMOUNT: commissionResult?.commissionAmount || '0.00',
          COMMISSIONWALLET: commissionResult?.commissionWallet?.walletMsisdn || '',
          COMMISSIONWALLETCODE: commissionResult?.commissionWallet?.walletCode || 0,
          COMMISSIONWALLETDEBIT: commissionResult?.commissionWallet?.debitAmount || '0.00',
          SOURCECOMMISSIONCREDIT: commissionResult?.sourceCommissionCredit || '0.00',
          DESTINATIONCOMMISSIONCREDIT: commissionResult?.destinationCommissionCredit || '0.00',
          CHARGEPAYER:chargepay,
          COMMISIONPAYER:commission,
          SourceDebitAmount: chargeResult?.sourceDebitAmount || Number(createTransactionDto.amount).toFixed(2),
          DestinationCreditAmount: chargeResult?.destinationCreditAmount || Number(createTransactionDto.amount).toFixed(2),
          DestinationBalance:destinationuser.Amount,
          DestinationFullname:destinationuser.Full_Name,
          SourceFullname:userDetails.Full_Name,
          TRNSID:transactionRequest.ID,TransactionId:transactionRequest.transectionId,
          referenceId: createTransactionDto.referenceId,
          AMLReservation: amlReservation ? {
            status: amlReservation.reservationStatus,
            walletCode: amlReservation.walletCode,
          } : { status: 'BYPASSED_SYSTEM_KEYWORD' },
        ...keywordResponse.keywordExists}
        try {
          await this.transactionRequestService.update(update);
          await this.processTransactionService.sendTransaction(message, createTransactionDto.keyword);
        } catch (error) {
          if (amlReservation) {
            await this.amlTransactionService.release(transactionRequest.transectionId).catch((releaseError) => {
              winstonLog.log(
                'error',
                'AML reservation release failed for transaction %s: %s',
                transactionRequest.transectionId,
                releaseError instanceof Error ? releaseError.message : String(releaseError),
              );
            });
          }
          await this.markTransactionFailed(transactionRequest.transectionId);
          winstonLog.log('error', 'Kafka submission failed for transaction %s', transactionRequest.transectionId);
          throw error;
        }
         return {Responsecode: 200, ResponseDescription: 'Transaction submitted successfully', TransactionID: transactionRequest.transectionId};
      }
      
    }
    else{

      await this.markTransactionFailed(transactionRequest.transectionId);
      winstonLog.log('error', 'AML Check failed for transaction: %s', JSON.stringify(amlResult));
      return {Responsecode: amlResult.code, ResponseDescription: amlResult.msg, TransactionID: transactionRequest.transectionId};
     // return keywordResponse.AMLCHECK[0];
    }
  
    // Implement the transaction processing logic here
  }
  private async markTransactionFailed(transactionId: string) {
    await this.transactionRequestService.update({
      transactionId,
      feePayer: '0',
      commissionReceiver: '0',
      transactionFee: '0.00',
      transactionCommission: '0.00',
      transactionStatus: BigInt(3),
    });
  }

  async getTransactionRequest(transactionId: string) {
    return await this.transactionRequestService.findOne(transactionId);
  }
  async findAllPaginated(paginationDto: PaginationDto): Promise<PaginationResponse<SwTblTransactionEntry>> {
  return this.transactionRequestService.findAllPaginated(paginationDto);
}
}
