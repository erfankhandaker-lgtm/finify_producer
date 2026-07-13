import { Injectable } from '@nestjs/common';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { SwTblKeyword, SwViewAllUser, TransactionRequest, WalletDetail } from '@models/index';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class RegistrationService {
  constructor(
    @InjectRepository(SwTblKeyword) private readonly keywordRepository: Repository<SwTblKeyword>,
    @InjectRepository(WalletDetail) private readonly walletDetailRepository: Repository<WalletDetail>,
    @InjectRepository(SwViewAllUser) private readonly swViewAllUserRepository: Repository<SwViewAllUser>,
    @InjectRepository(TransactionRequest) private readonly transactionRequestRepository: Repository<TransactionRequest>,
  ) {}


  async getaccount(Mobile_Number: number) {
    const select = { MSISDN: true, Full_Name: true, Email: true, Amount: true, is_default: true, Wallet_Code: true };
    return this.swViewAllUserRepository.find({ where: { Mobile_Number: String(Mobile_Number) }, select });
  }
  async getdefaultaccount(Mobile_Number: number) {
    const select = { MSISDN: true, Full_Name: true, Email: true, Amount: true, is_default: true, Wallet_Code: true };
    return this.swViewAllUserRepository.findOne({ where: { Mobile_Number: String(Mobile_Number), is_default: true }, select });
  }
  create(createRegistrationDto: CreateRegistrationDto) {
    return 'This action adds a new registration';
  }

  findAll() {
    return `This action returns all registration`;
  }

  findOne(id: number) {
    return `This action returns a #${id} registration`;
  }

  update(id: number, updateRegistrationDto: UpdateRegistrationDto) {
    return `This action updates a #${id} registration`;
  }

  remove(id: number) {
    return `This action removes a #${id} registration`;
  }
}
