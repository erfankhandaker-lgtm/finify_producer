import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REDIS_CONNECTION } from '@config/constants';
import {
  SwTblCommission,
  SwTblCommissionDetail,
  SwTblCommissionMapping,
  SwTblKeywordCommission,
  SwTblWallet,
  SwTblWalletType,
} from '@models/index';
import Decimal from 'decimal.js';
import { Repository } from 'typeorm';
import { CalculateCommissionDto } from './dto/commission.dto';

@Injectable()
export class CommissionService {
  private readonly loads = new Map<string, Promise<any>>();

  constructor(
    @InjectRepository(SwTblCommission) private readonly commissions: Repository<SwTblCommission>,
    @InjectRepository(SwTblCommissionDetail) private readonly details: Repository<SwTblCommissionDetail>,
    @InjectRepository(SwTblCommissionMapping) private readonly mappings: Repository<SwTblCommissionMapping>,
    @InjectRepository(SwTblKeywordCommission) private readonly keywordCommissions: Repository<SwTblKeywordCommission>,
    @InjectRepository(SwTblWallet) private readonly wallets: Repository<SwTblWallet>,
    @InjectRepository(SwTblWalletType) private readonly walletTypes: Repository<SwTblWalletType>,
    @Inject(REDIS_CONNECTION) private readonly cache: any,
  ) {}

  async calculate(dto: CalculateCommissionDto) {
    const amount = this.decimal(dto.amount, 'amount');
    if (amount.lessThanOrEqualTo(0)) throw new BadRequestException('Transaction amount must be greater than zero');
    const config = await this.configuration(dto.keyword, dto.walletId);
    const detail = this.selectDetail(config.commission, config.details, amount);
    const commissionAmount = this.calculateDetail(detail, amount);
    const receiver = config.keywordCommission.receiver?.trim();
    if (receiver !== 'S' && receiver !== 'D') throw new BadRequestException('Commission receiver must be S or D');

    return {
      transactionId: dto.transactionId,
      keyword: dto.keyword,
      walletId: dto.walletId,
      keywordCommissionId: config.keywordCommission.keywordCommissionId,
      commissionId: config.commission.commissionId,
      commissionDetailId: detail.rowId,
      receiver,
      headerCommissionType: config.commission.commissionType,
      calculationType: this.detailType(detail.commissionType),
      commissionValue: this.format(this.decimal(detail.commissionValue, 'commissionValue')),
      commissionAmount: this.format(commissionAmount),
      sourceCommissionCredit: receiver === 'S' ? this.format(commissionAmount) : '0.00',
      destinationCommissionCredit: receiver === 'D' ? this.format(commissionAmount) : '0.00',
      commissionWallet: {
        walletMsisdn: config.wallet.wallet.walletMsisdn,
        walletCode: config.wallet.wallet.walletCode,
        walletName: config.wallet.type.walletName,
        walletDetails: config.wallet.type.walletDetails,
        debitAmount: this.format(commissionAmount),
      },
    };
  }

  private async configuration(keyword: string, walletId: number) {
    const version = await this.cacheGet('commission:config:version') || '1';
    const key = `commission:config:${version}:${keyword}:${walletId}`;
    const cached = await this.cacheGet(key);
    if (cached) try { return JSON.parse(cached); } catch { await this.cacheDel(key); }
    if (this.loads.has(key)) return this.loads.get(key);
    const promise = this.loadConfiguration(keyword, walletId, key);
    this.loads.set(key, promise);
    try { return await promise; } finally { this.loads.delete(key); }
  }

  private async loadConfiguration(keyword: string, walletId: number, key: string) {
    let rows = await this.keywordCommissions.find({ where: { keyword, walletId, status: 1 } });
    if (rows.length > 1) throw new ConflictException('Multiple active commission configurations match keyword and wallet');
    if (!rows.length) rows = await this.keywordCommissions.find({ where: { keyword, isDefault: 1, status: 1 } });
    if (rows.length > 1) throw new ConflictException('Multiple active default commission configurations found');
    if (!rows.length) throw new NotFoundException('Active commission configuration not found');
    const keywordCommission = rows[0];

    const [mapping, commission] = await Promise.all([
      this.resolveMapping(keywordCommission.keywordCommissionId),
      this.resolveCommission(keywordCommission.commissionId, new Set()),
    ]);
    const [details, wallet] = await Promise.all([
      this.details.find({ where: { commissionId: commission.commissionId } }),
      this.systemWallet(114),
    ]);
    const result = { keywordCommission, mapping, commission, details, wallet };
    await this.cacheSet(key, JSON.stringify(result), 300);
    return result;
  }

  private async resolveMapping(keywordCommissionId: number) {
    const rows = await this.mappings.find({ where: { keywordCommissionId, status: 1 } });
    if (rows.length > 1) throw new ConflictException('Multiple active commission mappings found');
    if (!rows.length) throw new NotFoundException('Active commission mapping not found');
    return rows[0];
  }

  private async resolveCommission(id: number, visited: Set<number>): Promise<SwTblCommission> {
    if (visited.has(id)) throw new ConflictException('Circular default commission configuration detected');
    visited.add(id);
    const row = await this.commissions.findOne({ where: { commissionId: id } });
    if (!row || !row.approvedBy) throw new NotFoundException(`Approved commission ${id} not found`);
    const hasExpiry = Boolean(row.expiryOn);
    const hasDefault = row.defaultCommissionId !== null && row.defaultCommissionId !== undefined;
    if (hasExpiry !== hasDefault) throw new BadRequestException('Expiry and default commission must be configured together');
    if (!hasExpiry || row.defaultCommissionId === row.commissionId) return row;
    const expiry = new Date(row.expiryOn); expiry.setUTCHours(23, 59, 59, 999);
    return new Date() <= expiry ? row : this.resolveCommission(row.defaultCommissionId, visited);
  }

  private selectDetail(header: SwTblCommission, rows: SwTblCommissionDetail[], amount: Decimal) {
    if (!rows.length) throw new NotFoundException('Commission details not found');
    if (this.headerType(header.commissionType) === 0) {
      if (rows.length !== 1) throw new ConflictException('Fixed commission must have exactly one detail');
      return rows[0];
    }
    const matches = rows.filter(row => amount.greaterThanOrEqualTo(this.decimal(row.startRange, 'startRange')) && amount.lessThanOrEqualTo(this.decimal(row.endRange, 'endRange')));
    if (!matches.length) throw new NotFoundException('No commission range matches the transaction amount');
    if (matches.length > 1) throw new ConflictException('Overlapping commission ranges found');
    return matches[0];
  }

  private calculateDetail(row: SwTblCommissionDetail, amount: Decimal) {
    const value = this.decimal(row.commissionValue, 'commissionValue');
    if (this.detailType(row.commissionType) === 0) return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const min = this.decimal(row.minCommission, 'minCommission');
    const max = this.decimal(row.maxCommission, 'maxCommission');
    if (min.greaterThan(max)) throw new BadRequestException('Invalid commission bounds');
    return Decimal.max(min, Decimal.min(max, amount.times(value).div(100))).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  private headerType(value: number | string) { const v = String(value).trim().toUpperCase(); if (v === '0' || v === 'F') return 0; if (v === '1' || v === 'D') return 1; throw new BadRequestException('Unsupported commission header type'); }
  private detailType(value: string) { const v = String(value).trim().toLowerCase(); if (v === '0' || v === 'flat') return 0; if (v === '1' || v === 'perc' || v === 'percent' || v === 'percentage') return 1; throw new BadRequestException('Unsupported commission detail type'); }
  private decimal(value: Decimal.Value, field: string) { try { return new Decimal(String(value).replace(/[^0-9.-]/g, '')); } catch { throw new BadRequestException(`${field} must be a valid decimal`); } }
  private format(value: Decimal) { return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2); }

  private async systemWallet(code: number) {
    const [wallets, type] = await Promise.all([this.wallets.find({ where: { walletCode: code } }), this.walletTypes.findOne({ where: { walletId: code } })]);
    if (wallets.length !== 1) throw new ConflictException(`Exactly one system wallet is required for code ${code}`);
    if (!type) throw new NotFoundException(`Wallet type ${code} not found`);
    return { wallet: wallets[0], type };
  }

  async listCommissions() { return this.commissions.find({ order: { commissionId: 'ASC' } }); }
  async getCommission(id: number) { const row = await this.commissions.findOne({ where: { commissionId: id } }); if (!row) throw new NotFoundException('Commission not found'); return { ...row, details: await this.details.find({ where: { commissionId: id } }) }; }
  async listMappings() { return this.mappings.find({ order: { rowId: 'ASC' } }); }
  async listKeywordCommissions() { return this.keywordCommissions.find({ order: { rowId: 'ASC' } }); }

  private async cacheGet(key: string) { try { return await this.cache?.get(key); } catch { return null; } }
  private async cacheSet(key: string, value: string, ttl: number) { try { await this.cache?.setEx(key, ttl, value); } catch {} }
  private async cacheDel(key: string) { try { await this.cache?.del(key); } catch {} }
}
