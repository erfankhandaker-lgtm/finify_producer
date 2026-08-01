/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from '@nestjs/common';
import { SwTblKeyword, WalletDetail } from '@models/index';
import { KeywordDto } from './dto/keyword.dto';
import { winstonLog } from '@config/winstonLog';
import { service_blocked, service_deactivate, service_minimum_amount } from '@utils/message';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class KeywordService {
  constructor(
    @InjectRepository(SwTblKeyword) private readonly keywordRepository: Repository<SwTblKeyword>,
    @InjectRepository(WalletDetail) private readonly walletDetailRepository: Repository<WalletDetail>,
    private readonly DB: DataSource,
  ) {}


// checking service details and producing initial check result.

async checkwalletdetails(keyworddto: KeywordDto){

    const select = { walletMsisdn: true, walletDetails: true, amount: true, commissionBalance: true, walletCode: true, walletType: true, walletName: true, walletNameLocal: true, parent: true, createdDate: true, status: true, holdTransferDay: true, isHoldTransfer: true };

    const [sourcedetails, destinationdetails] = await Promise.all([
      this.walletDetailRepository.findOne({where: {walletMsisdn: keyworddto.sourceaccount}, select}),
      this.walletDetailRepository.findOne({where: {walletMsisdn: keyworddto.destinationaccount}, select}),
    ]);
     if (!sourcedetails) {
      winstonLog.log('error', 'Source Account not found');
      return {ResponseCode: 998, ResponseDescription: 'Source Account not found'};
    }
    if (!destinationdetails) {
      return {ResponseCode: 997, ResponseDescription: 'Destination Account not found'};
    }
    let wallettype = 'S';
    switch (destinationdetails.walletType) {
      case 200:
        wallettype = 'M';
        break;
      case 300:
        wallettype = 'A';
        break;
      case 100:
        wallettype = 'C';
        break;
      default:
        wallettype = 'S';
    }
    return { ResponseCode: 200, SourceDetails: sourcedetails, DestinationDetails: destinationdetails, WalletType: wallettype};
}
  async checkkeyword(keyworddto: KeywordDto) {

    const keywordExists = await this.keywordRepository.findOne({
      where: {
        keyword:keyworddto.keyword,
       
      },
    });

    winstonLog.log('info','Keyword exists:%s', JSON.stringify(keywordExists));

    if (!keywordExists || keywordExists.isActive === false) {
      return service_deactivate;
    }
    else if (keywordExists.isActive === true && keywordExists.isFinancial === false) {
      return {ResponseCode:200, ResponseDescription: 'Keyword found and Service is Active'};
    }
    else if (keywordExists.isActive === true && keywordExists.isFinancial === true) {

      const walletCheck = await this.checkwalletdetails(keyworddto);
      if(walletCheck.ResponseCode !== 200) {
        return walletCheck;
      }

       if(walletCheck.WalletType === keywordExists.keywordScope){
        winstonLog.log('info','Keyword found and Service is Active and Financial for wallet type: %s', walletCheck.WalletType);
        winstonLog.log('info', 'Minimum transaction amount: %d, Provided amount: %d', keywordExists.minimumTranAmount, keyworddto.amount);
        if (keywordExists.minimumTranAmount > keyworddto.amount){
          return service_minimum_amount;
        }
        if(keywordExists.isSystemKeyword === true){
          return {
            ResponseCode: 200,
            ResponseDescription: 'Keyword found and Service is Active and Financial',
            AMLCHECK: [{ code: 100, msg: 'AML check bypassed for system keyword' }],
            ...walletCheck,
            keywordExists,
          };
        }
        else{
            // The legacy sw_proc_aml_check_app function is intentionally no
            // longer used. AmlTransactionService performs the authoritative,
            // concurrency-safe reservation immediately before Kafka dispatch.
            const AMLCHECK = [{
              code: 100,
              msg: 'AML eligibility passed; transactional reservation required',
            }];
            return {AMLCHECK, ...walletCheck, keywordExists};
        }
       }
       else{
        return service_blocked;
       }
      

      // return {ResponseCode:200, ResponseDescription: 'Keyword found and Service is Active and Financial', ...walletCheck};

    }
    return {ResponseCode:200, ResponseDescription: 'Keyword found'};
  }
}
