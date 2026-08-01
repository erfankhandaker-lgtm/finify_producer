import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { Repository } from 'typeorm';
import {
  SwTblCharge,
  SwTblChargeDetail,
  SwTblChargeMapping,
  SwTblKeywordCharge,
  SwTblWallet,
  SwTblWalletType,
} from '@models/index';
import {
  CalculateChargeDto,
  CreateChargeDetailDto,
  CreateChargeDto,
  CreateChargeMappingDto,
  CreateKeywordChargeDto,
  UpdateChargeDetailDto,
  UpdateChargeDto,
  UpdateChargeMappingDto,
  UpdateKeywordChargeDto,
} from './dto/charge.dto';
import { REDIS_CONNECTION } from '@config/constants';
import { PricingFlowService } from '../pricing-rules/pricing-flow.service';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

@Injectable()
export class ChargeService {
  private readonly configurationLoads = new Map<string, Promise<any>>();

  constructor(
    @InjectRepository(SwTblCharge) private readonly charges: Repository<SwTblCharge>,
    @InjectRepository(SwTblChargeDetail) private readonly details: Repository<SwTblChargeDetail>,
    @InjectRepository(SwTblChargeMapping) private readonly mappings: Repository<SwTblChargeMapping>,
    @InjectRepository(SwTblKeywordCharge) private readonly keywordCharges: Repository<SwTblKeywordCharge>,
    @InjectRepository(SwTblWallet) private readonly wallets: Repository<SwTblWallet>,
    @InjectRepository(SwTblWalletType) private readonly walletTypes: Repository<SwTblWalletType>,
    @Inject(REDIS_CONNECTION) private readonly cache: any,
    private readonly pricingFlows: PricingFlowService,
  ) {}

  async calculate(dto: CalculateChargeDto) {
    const amount = this.money(dto.amount, 'amount');
    if (amount.isNegative() || amount.isZero()) throw new BadRequestException('Transaction amount must be greater than zero');

    const visualSourceWalletType = dto.sourceWalletType || dto.walletId;
    const visualFlow = await this.pricingFlows.findActive(
      dto.keyword,
      visualSourceWalletType,
      dto.currency || 'UGX',
      dto.destinationWalletType,
    );
    if (visualFlow) {
      const result = this.pricingFlows.simulate(
        visualFlow.definition,
        dto.amount,
        dto.destinationWalletType === undefined
          ? undefined
          : visualSourceWalletType,
        dto.destinationWalletType,
      );
      const chargeWallet = await this.resolveSystemWallet(
        visualFlow.definition.settlement.chargeWalletType,
        dto.currency || 'UGX',
      );
      return {
        transactionId: dto.transactionId,
        keyword: dto.keyword,
        walletId: dto.walletId,
        pricingFlowId: visualFlow.id,
        pricingRuleCode: visualFlow.ruleCode,
        chargeId: Number(visualFlow.id),
        chargeDetailId: Number(visualFlow.id),
        payer: result.chargePayer,
        headerChargeType: visualFlow.definition.charge.mode === 'FIXED' ? 0 : 1,
        calculationType: result.chargeCalculationType === 'FIXED' ? 0 : 1,
        chargeValue: this.format(this.money(result.chargeCalculationValue, 'chargeValue')),
        matchedChargeRange: result.matchedChargeRange,
        chargeAmount: result.chargeAmount,
        sourceDebitAmount: result.sourceDebitAmount,
        destinationCreditAmount: result.destinationCreditAmount,
        chargeWallet: {
          walletMsisdn: chargeWallet.wallet.walletMsisdn,
          walletCode: chargeWallet.wallet.walletCode,
          walletName: chargeWallet.type.walletName,
          walletDetails: chargeWallet.type.walletDetails,
          creditAmount: result.chargeAmount,
        },
      };
    }

    const configuration = await this.resolveConfiguration(
      dto.keyword,
      dto.walletId,
      dto.currency || 'UGX',
    );
    const { keywordCharge, charge, chargeWallet, details } = configuration;
    const detail = this.resolveDetail(charge, amount, details);
    const chargeAmount = this.calculateDetail(detail, amount);
    if (chargeAmount.greaterThan(amount) && keywordCharge.payer.trim() === 'D') {
      throw new BadRequestException('Destination charge cannot exceed the transaction amount');
    }

    const sourceDebit = keywordCharge.payer.trim() === 'S' ? amount.plus(chargeAmount) : amount;
    const destinationCredit = keywordCharge.payer.trim() === 'D' ? amount.minus(chargeAmount) : amount;

    return {
      transactionId: dto.transactionId,
      keyword: dto.keyword,
      walletId: dto.walletId,
      keywordChargeId: keywordCharge.keywordChargeId,
      chargeId: charge.chargeId,
      chargeDetailId: detail.rowId,
      payer: keywordCharge.payer.trim() as 'S' | 'D',
      headerChargeType: charge.chargeType,
      calculationType: this.detailType(detail.chargeType),
      chargeValue: this.format(this.money(detail.chargeValue, 'chargeValue')),
      chargeAmount: this.format(chargeAmount),
      sourceDebitAmount: this.format(sourceDebit),
      destinationCreditAmount: this.format(destinationCredit),
      chargeWallet: {
        walletMsisdn: chargeWallet.wallet.walletMsisdn,
        walletCode: chargeWallet.wallet.walletCode,
        walletName: chargeWallet.type.walletName,
        walletDetails: chargeWallet.type.walletDetails,
        creditAmount: this.format(chargeAmount),
      },
    };
  }

  private async resolveConfiguration(keyword: string, walletId: number, currency: string) {
    const normalizedCurrency = currency.trim().toUpperCase();
    const version = await this.cacheGet('charge:config:version') || '1';
    const key = `charge:config:${version}:${keyword}:${walletId}:${normalizedCurrency}`;
    const cached = await this.cacheGet(key);
    if (cached) {
      try { return JSON.parse(cached); } catch { await this.cacheDelete(key); }
    }

    const existingLoad = this.configurationLoads.get(key);
    if (existingLoad) return existingLoad;

    const load = this.loadConfiguration(keyword, walletId, normalizedCurrency, key);
    this.configurationLoads.set(key, load);
    try {
      return await load;
    } finally {
      this.configurationLoads.delete(key);
    }
  }

  private async loadConfiguration(
    keyword: string,
    walletId: number,
    currency: string,
    key: string,
  ) {
    const keywordCharge = await this.resolveKeywordCharge(keyword, walletId);
    const [mapping, charge] = await Promise.all([
      this.resolveActiveMapping(keywordCharge.keywordChargeId),
      this.resolveCharge(keywordCharge.chargeId, new Set<number>()),
    ]);
    const [details, chargeWallet] = await Promise.all([
      this.details.find({ where: { chargeId: charge.chargeId } }),
      this.resolveSystemWallet(113, currency),
    ]);
    const configuration = { keywordCharge, mapping, charge, details, chargeWallet };
    await this.cacheSet(key, JSON.stringify(configuration), 300);
    return configuration;
  }

  private async resolveSystemWallet(walletCode: number, currency: string) {
    const normalizedCurrency = currency.trim().toUpperCase();
    const wallets = await this.wallets.find({
      where: { walletCode, currency: normalizedCurrency },
    });
    if (!wallets.length) {
      throw new NotFoundException(
        `System wallet ${walletCode} not found for ${normalizedCurrency}`,
      );
    }
    if (wallets.length > 1) {
      throw new ConflictException(
        `Multiple system wallets found for wallet code ${walletCode} and ${normalizedCurrency}`,
      );
    }
    const type = await this.walletTypes.findOne({ where: { walletId: walletCode } });
    if (!type) throw new NotFoundException(`Wallet type ${walletCode} not found`);
    return { wallet: wallets[0], type };
  }

  private async resolveKeywordCharge(keyword: string, walletId: number) {
    const exact = await this.keywordCharges.find({ where: { keyword, walletId, status: 1 } });
    if (exact.length > 1) throw new ConflictException('Multiple active charge configurations match this keyword and wallet');
    if (exact.length === 1) return this.validatePayer(exact[0]);

    const defaults = await this.keywordCharges.find({ where: { keyword, isDefault: 1, status: 1 } });
    if (defaults.length > 1) throw new ConflictException('Multiple active default charge configurations match this keyword');
    if (!defaults.length) throw new NotFoundException('Active charge configuration not found');
    return this.validatePayer(defaults[0]);
  }

  private validatePayer(config: SwTblKeywordCharge) {
    const payer = config.payer?.trim();
    if (payer !== 'S' && payer !== 'D') throw new BadRequestException('Charge payer must be S or D');
    return config;
  }

  private async resolveActiveMapping(keywordChargeId: number) {
    const rows = await this.mappings.find({ where: { keywordChargeId, status: 1 } });
    if (rows.length > 1) throw new ConflictException('Multiple active charge mappings found');
    if (!rows.length) throw new NotFoundException('Active charge mapping not found');
    return rows[0];
  }

  private async resolveCharge(chargeId: number, visited: Set<number>): Promise<SwTblCharge> {
    if (visited.has(chargeId)) throw new ConflictException('Circular default charge configuration detected');
    visited.add(chargeId);
    const charge = await this.charges.findOne({ where: { chargeId, status: 1 } });
    if (!charge) throw new NotFoundException(`Active charge ${chargeId} not found`);

    const hasExpiry = Boolean(charge.expiryOn);
    const hasDefault = charge.defaultChargeId !== null && charge.defaultChargeId !== undefined;
    if (hasExpiry !== hasDefault) throw new BadRequestException(`Charge ${chargeId} must define both Expiry_On and Def_Charge_ID, or neither`);
    if (!hasExpiry) return charge;

    const expiry = new Date(charge.expiryOn);
    expiry.setUTCHours(23, 59, 59, 999);
    if (Number.isNaN(expiry.getTime())) throw new BadRequestException(`Charge ${chargeId} has an invalid expiry date`);
    if (new Date() <= expiry) return charge;
    return this.resolveCharge(charge.defaultChargeId, visited);
  }

  private resolveDetail(charge: SwTblCharge, amount: Decimal, rows: SwTblChargeDetail[]) {
    if (!rows.length) throw new NotFoundException(`Charge details not found for charge ${charge.chargeId}`);

    if (this.headerType(charge.chargeType) === 'F') {
      if (rows.length !== 1) throw new ConflictException('Fixed charge must have exactly one detail row');
      return rows[0];
    }

    const matches = rows.filter(row => {
      if (row.startRange === null || row.endRange === null) return false;
      const start = this.money(row.startRange, 'startRange');
      const end = this.money(row.endRange, 'endRange');
      if (start.greaterThan(end)) throw new BadRequestException(`Invalid range on charge detail ${row.rowId}`);
      return amount.greaterThanOrEqualTo(start) && amount.lessThanOrEqualTo(end);
    });
    if (!matches.length) throw new NotFoundException('No charge range matches the transaction amount');
    if (matches.length > 1) throw new ConflictException('Overlapping charge ranges match the transaction amount');
    return matches[0];
  }

  private calculateDetail(detail: SwTblChargeDetail, amount: Decimal) {
    const value = this.money(detail.chargeValue, 'chargeValue');
    if (value.isNegative()) throw new BadRequestException('Charge value cannot be negative');
    if (this.detailType(detail.chargeType) === 0) return value.toDecimalPlaces(2);

    if (detail.minCharge === null || detail.maxCharge === null) {
      throw new BadRequestException('Percentage charge requires Min_Charge and Max_Charge');
    }
    const minimum = this.money(detail.minCharge, 'minCharge');
    const maximum = this.money(detail.maxCharge, 'maxCharge');
    if (minimum.isNegative() || maximum.isNegative() || minimum.greaterThan(maximum)) {
      throw new BadRequestException('Invalid percentage charge bounds');
    }
    return Decimal.max(minimum, Decimal.min(maximum, amount.times(value).dividedBy(100))).toDecimalPlaces(2);
  }

  private headerType(value: number | string): 'F' | 'D' {
    const normalized = String(value).trim().toUpperCase();
    if (normalized === '0' || normalized === 'F') return 'F';
    if (normalized === '1' || normalized === 'D') return 'D';
    throw new BadRequestException(`Unsupported header charge type: ${value}`);
  }

  private detailType(value: string): 0 | 1 {
    const normalized = String(value).trim().toLowerCase();
    if (normalized === '0' || normalized === 'flat') return 0;
    if (normalized === '1' || normalized === 'percentage' || normalized === 'percent') return 1;
    throw new BadRequestException(`Unsupported detail charge type: ${value}`);
  }

  private money(value: Decimal.Value, field: string) {
    try { return new Decimal(value); } catch { throw new BadRequestException(`${field} must be a valid decimal`); }
  }

  private format(value: Decimal) { return value.toDecimalPlaces(2).toFixed(2); }

  private async cacheGet(key: string) { try { return await this.cache?.get(key); } catch { return null; } }
  private async cacheSet(key: string, value: string, ttl: number) { try { await this.cache?.setEx(key, ttl, value); } catch {} }
  private async cacheDelete(key: string) { try { await this.cache?.del(key); } catch {} }
  private async invalidateCache() {
    try { await this.cache?.delByPattern?.('charge:config:*'); } catch {}
    await this.cacheSet('charge:config:version', String(Date.now()), 86400 * 365);
  }

  private validateExpiryPair(expiryOn?: string | Date | null, defaultChargeId?: number | null) {
    if (Boolean(expiryOn) !== (defaultChargeId !== null && defaultChargeId !== undefined)) {
      throw new BadRequestException('Expiry_On and Def_Charge_ID must be provided together or both omitted');
    }
  }

  async listCharges() { return this.charges.find({ order: { chargeId: 'ASC' } }); }
  async getCharge(chargeId: number) {
    const charge = await this.charges.findOne({ where: { chargeId } });
    if (!charge) throw new NotFoundException('Charge not found');
    return { ...charge, details: await this.details.find({ where: { chargeId }, order: { rowId: 'ASC' } }) };
  }
  async createCharge(dto: CreateChargeDto) {
    this.validateExpiryPair(dto.expiryOn, dto.defaultChargeId);
    if (await this.charges.exists({ where: { chargeId: dto.chargeId } })) throw new ConflictException('Charge ID already exists');
    const saved = await this.charges.save(this.charges.create({ ...dto, status: 0, createdBy: dto.maker, createdDate: new Date(), approvedBy: null, approvedDate: null }));
    await this.invalidateCache();
    return saved;
  }
  async updateCharge(chargeId: number, dto: UpdateChargeDto) {
    const charge = await this.charges.findOne({ where: { chargeId } });
    if (!charge) throw new NotFoundException('Charge not found');
    const expiryOn = dto.expiryOn !== undefined ? dto.expiryOn : charge.expiryOn;
    const defaultChargeId = dto.defaultChargeId !== undefined ? dto.defaultChargeId : charge.defaultChargeId;
    this.validateExpiryPair(expiryOn, defaultChargeId);
    Object.assign(charge, dto, { modifiedBy: dto.maker, modifiedDate: new Date(), status: 0, approvedBy: null, approvedDate: null });
    const saved = await this.charges.save(charge);
    await this.invalidateCache();
    return saved;
  }
  async approveCharge(chargeId: number, checker: string) {
    const charge = await this.charges.findOne({ where: { chargeId } });
    if (!charge) throw new NotFoundException('Charge not found');
    this.assertDifferentChecker(checker, charge.modifiedBy || charge.createdBy);
    Object.assign(charge, { status: 1, approvedBy: checker, approvedDate: new Date() });
    const saved = await this.charges.save(charge);
    await this.invalidateCache();
    return saved;
  }
  async deactivateCharge(chargeId: number, maker: string) {
    const charge = await this.charges.findOne({ where: { chargeId } });
    if (!charge) throw new NotFoundException('Charge not found');
    Object.assign(charge, { status: 0, modifiedBy: maker, modifiedDate: new Date(), approvedBy: null, approvedDate: null });
    const saved = await this.charges.save(charge);
    await this.invalidateCache();
    return saved;
  }
  async deleteCharge(chargeId: number) {
    const charge = await this.charges.findOne({ where: { chargeId } });
    if (!charge) throw new NotFoundException('Charge not found');
    if (charge.status === 1) throw new ConflictException('Active charge cannot be deleted; deactivate it first');
    if (await this.keywordCharges.exists({ where: { chargeId } })) throw new ConflictException('Charge is in use by keyword charge configuration');
    if (await this.charges.exists({ where: { defaultChargeId: chargeId } })) throw new ConflictException('Charge is in use as a default charge');
    if (await this.details.exists({ where: { chargeId } })) throw new ConflictException('Delete charge detail rows before deleting the charge');
    await this.charges.delete({ chargeId });
    await this.invalidateCache();
    return { deleted: true };
  }

  async listDetails(chargeId?: number) { return this.details.find({ where: chargeId ? { chargeId } : {}, order: { rowId: 'ASC' } }); }
  async getDetail(rowId: number) { const row = await this.details.findOne({ where: { rowId } }); if (!row) throw new NotFoundException('Charge detail not found'); return row; }
  async createDetail(dto: CreateChargeDetailDto) {
    this.validateDetailDto(dto);
    const { maker, ...data } = dto;
    const saved = await this.details.save(this.details.create(data));
    await this.markChargePending(dto.chargeId, maker);
    await this.invalidateCache();
    return saved;
  }
  async updateDetail(rowId: number, dto: UpdateChargeDetailDto) {
    const row = await this.details.findOne({ where: { rowId } });
    if (!row) throw new NotFoundException('Charge detail not found');
    const { maker, ...data } = dto;
    Object.assign(row, data); this.validateDetailDto(row);
    const saved = await this.details.save(row);
    await this.markChargePending(row.chargeId, maker);
    await this.invalidateCache();
    return saved;
  }
  async deleteDetail(rowId: number, maker: string) {
    const row = await this.details.findOne({ where: { rowId } });
    if (!row) throw new NotFoundException('Charge detail not found');
    const parent = await this.charges.findOne({ where: { chargeId: row.chargeId } });
    if (parent?.status === 1 || await this.keywordCharges.exists({ where: { chargeId: row.chargeId, status: 1 } })) {
      throw new ConflictException('Charge detail is in use by an active charge configuration');
    }
    await this.details.delete(rowId);
    await this.markChargePending(row.chargeId, maker);
    await this.invalidateCache();
    return { deleted: true };
  }

  private async markChargePending(chargeId: number, maker: string) {
    const charge = await this.charges.findOne({ where: { chargeId } });
    if (!charge) throw new NotFoundException('Parent charge not found');
    Object.assign(charge, { status: 0, modifiedBy: maker, modifiedDate: new Date(), approvedBy: null, approvedDate: null });
    await this.charges.save(charge);
  }

  private validateDetailDto(dto: Partial<CreateChargeDetailDto>) {
    const type = this.detailType(dto.chargeType);
    const value = this.money(dto.chargeValue, 'chargeValue');
    if (value.isNegative()) throw new BadRequestException('Charge value cannot be negative');
    if (type === 1 && (dto.minCharge === undefined || dto.maxCharge === undefined)) throw new BadRequestException('Percentage charge requires minCharge and maxCharge');
  }

  async listMappings() { return this.mappings.find({ order: { rowId: 'ASC' } }); }
  async getMapping(rowId: number) { const row = await this.mappings.findOne({ where: { rowId } }); if (!row) throw new NotFoundException('Charge mapping not found'); return row; }
  async createMapping(dto: CreateChargeMappingDto) { const saved = await this.mappings.save(this.mappings.create({ ...dto, status: 0, operationType: 'I', createdBy: dto.maker, createdDate: new Date() })); await this.invalidateCache(); return saved; }
  async updateMapping(rowId: number, dto: UpdateChargeMappingDto) {
    const row = await this.mappings.findOne({ where: { rowId } }); if (!row) throw new NotFoundException('Charge mapping not found');
    Object.assign(row, dto, { status: 0, operationType: 'U', modifiedBy: dto.maker, modifiedDate: new Date(), approvedBy: null, approvedDate: null }); const saved = await this.mappings.save(row); await this.invalidateCache(); return saved;
  }
  async approveMapping(rowId: number, checker: string) { const row = await this.mappings.findOne({ where: { rowId } }); if (!row) throw new NotFoundException('Charge mapping not found'); this.assertDifferentChecker(checker, row.modifiedBy || row.createdBy); Object.assign(row, { status: 1, approvedBy: checker, approvedDate: new Date() }); const saved = await this.mappings.save(row); await this.invalidateCache(); return saved; }
  async deactivateMapping(rowId: number, maker: string) { const row = await this.mappings.findOne({ where: { rowId } }); if (!row) throw new NotFoundException('Charge mapping not found'); Object.assign(row, { status: 0, operationType: 'U', modifiedBy: maker, modifiedDate: new Date(), approvedBy: null, approvedDate: null }); const saved = await this.mappings.save(row); await this.invalidateCache(); return saved; }
  async deleteMapping(rowId: number) {
    const row = await this.mappings.findOne({ where: { rowId } });
    if (!row) throw new NotFoundException('Charge mapping not found');
    if (row.status === 1) throw new ConflictException('Active charge mapping cannot be deleted; deactivate it first');
    if (await this.keywordCharges.exists({ where: { keywordChargeId: row.keywordChargeId } })) throw new ConflictException('Charge mapping is in use by keyword charge configuration');
    await this.mappings.delete(rowId);
    await this.invalidateCache();
    return { deleted: true };
  }

  async listKeywordCharges() { return this.keywordCharges.find({ order: { rowId: 'ASC' } }); }
  async getKeywordCharge(rowId: number) { const row = await this.keywordCharges.findOne({ where: { rowId } }); if (!row) throw new NotFoundException('Keyword charge not found'); return row; }
  async createKeywordCharge(dto: CreateKeywordChargeDto) { const saved = await this.keywordCharges.save(this.keywordCharges.create({ ...dto, status: 0, createdBy: dto.maker, createdDate: new Date() })); await this.invalidateCache(); return saved; }
  async updateKeywordCharge(rowId: number, dto: UpdateKeywordChargeDto) { const row = await this.keywordCharges.findOne({ where: { rowId } }); if (!row) throw new NotFoundException('Keyword charge not found'); Object.assign(row, dto, { status: 0, modifiedBy: dto.maker, modifiedDate: new Date(), approvedBy: null, approvedDate: null }); const saved = await this.keywordCharges.save(row); await this.invalidateCache(); return saved; }
  async approveKeywordCharge(rowId: number, checker: string) { const row = await this.keywordCharges.findOne({ where: { rowId } }); if (!row) throw new NotFoundException('Keyword charge not found'); this.assertDifferentChecker(checker, row.modifiedBy || row.createdBy); Object.assign(row, { status: 1, approvedBy: checker, approvedDate: new Date() }); const saved = await this.keywordCharges.save(row); await this.invalidateCache(); return saved; }
  async deactivateKeywordCharge(rowId: number, maker: string) { const row = await this.keywordCharges.findOne({ where: { rowId } }); if (!row) throw new NotFoundException('Keyword charge not found'); Object.assign(row, { status: 0, modifiedBy: maker, modifiedDate: new Date(), approvedBy: null, approvedDate: null }); const saved = await this.keywordCharges.save(row); await this.invalidateCache(); return saved; }
  async deleteKeywordCharge(rowId: number) {
    const row = await this.keywordCharges.findOne({ where: { rowId } });
    if (!row) throw new NotFoundException('Keyword charge not found');
    if (row.status === 1) throw new ConflictException('Active keyword charge cannot be deleted; deactivate it first');
    await this.keywordCharges.delete(rowId);
    await this.invalidateCache();
    return { deleted: true };
  }

  private assertDifferentChecker(checker: string, maker: string) {
    if (checker.trim().toLowerCase() === maker?.trim().toLowerCase()) throw new ForbiddenException('Maker and checker must be different users');
  }
}
