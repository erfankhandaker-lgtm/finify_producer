'use client';

import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileClock,
  Landmark,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './CreditCommercialWorkspace.module.css';

type RequestInit = { method?: string; body?: unknown };
export type CreditCommercialRequest = <T>(route: string, init?: RequestInit) => Promise<T>;

type Option = { id?: string; code: string | number; name: string; countryCode?: string; merchantId?: string };
type Metadata = {
  merchants: Option[]; lenders: Option[]; customerWalletTypes: Option[]; settlementWalletTypes: Option[];
  channels: Option[]; creditProducts: Option[]; fineractProducts: Array<{ id: number; name: string; tenant: string; currency: string }>;
  countries: string[]; currencies: string[];
};
type CommercialConfiguration = {
  id: string; code: string; version: number; revision: number; status: string; environmentScope: 'TEST' | 'PRODUCTION';
  productId: string; countryCode: string; currency: string; channel?: string | null;
  merchantId: string; merchantCode?: string; merchantName?: string; lenderId: string; lenderCode?: string; lenderName?: string;
  allocationWeight: number; customerWalletTypeCode: number; settlementWalletTypeCode: number;
  fineractTenant: string; fineractProductId: number; fineractProductName: string; pricingRuleCode: string;
  interestMethod: 'FLAT' | 'DECLINING_BALANCE' | 'HPA' | 'REVOLVING'; nominalInterestRate: number;
  interestRatePeriod: 'DAILY' | 'MONTHLY' | 'ANNUAL'; annualInterestRate?: number;
  repaymentFrequency: number; repaymentFrequencyType: 'DAYS' | 'WEEKS' | 'MONTHS';
  minimumRepayments: number; defaultRepayments: number; maximumRepayments: number;
  processingFeeType: 'FLAT' | 'PERCENT'; processingFeeValue: number;
  lateFeeType: 'FLAT' | 'PERCENT'; lateFeeValue: number; earlySettlementAllowed: boolean;
  earlySettlementFeeType: 'FLAT' | 'PERCENT'; earlySettlementFeeValue: number;
  chargeCodes: string[]; commissionCodes: string[]; activationBlockers: string[]; sourceReference: string;
  modifiedBy?: string; approvedBy?: string; activatedBy?: string; updatedAt?: string;
};
type AuditEntry = { id: string; action: string; actorId: string; reason?: string; createdAt: string };
type Simulation = { matched: boolean; reasonCode?: string; configuration?: CommercialConfiguration; projection?: Record<string, number | null> };

const emptyMetadata: Metadata = {
  merchants: [], lenders: [], customerWalletTypes: [], settlementWalletTypes: [], channels: [],
  creditProducts: [], fineractProducts: [], countries: [], currencies: [],
};

const blank = (): CommercialConfiguration => ({
  id: '', code: 'NEW_CREDIT_COMMERCIAL', version: 1, revision: 1, status: 'DRAFT', environmentScope: 'TEST',
  productId: 'UGA_RETAIL_CREDIT', countryCode: 'UGA', currency: 'UGX', channel: null,
  merchantId: '', lenderId: '', allocationWeight: 1, customerWalletTypeCode: 103, settlementWalletTypeCode: 205,
  fineractTenant: 'default', fineractProductId: 1, fineractProductName: 'DTB Uganda Test Credit',
  pricingRuleCode: 'DTB_TEST_FLAT_5_MONTHLY', interestMethod: 'FLAT', nominalInterestRate: 5,
  interestRatePeriod: 'MONTHLY', repaymentFrequency: 1, repaymentFrequencyType: 'MONTHS',
  minimumRepayments: 1, defaultRepayments: 3, maximumRepayments: 12,
  processingFeeType: 'PERCENT', processingFeeValue: 1, lateFeeType: 'PERCENT', lateFeeValue: 2,
  earlySettlementAllowed: true, earlySettlementFeeType: 'FLAT', earlySettlementFeeValue: 0,
  chargeCodes: ['FINERACT:1', 'FINERACT:2'], commissionCodes: ['NONE'], activationBlockers: [],
  sourceReference: 'Synthetic non-production configuration for integration testing',
});

export default function CreditCommercialWorkspace({ request, profile }: {
  request: CreditCommercialRequest;
  profile?: { roles?: string[]; permissions?: string[] };
}) {
  const [metadata, setMetadata] = useState<Metadata>(emptyMetadata);
  const [items, setItems] = useState<CommercialConfiguration[]>([]);
  const [form, setForm] = useState<CommercialConfiguration>(blank);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [principal, setPrincipal] = useState('400000');
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [busy, setBusy] = useState('load');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const canMake = profile?.roles?.includes('super_admin') || profile?.permissions?.includes('credit_commercial.make');
  const canCheck = profile?.roles?.includes('super_admin') || profile?.permissions?.includes('credit_commercial.check');
  const editable = ['DRAFT', 'REJECTED', 'TEST_ACTIVE'].includes(form.status);
  const lenders = metadata.lenders.filter((lender) => !form.merchantId || lender.merchantId === form.merchantId);
  const readiness = useMemo(() => {
    const issues: string[] = [];
    if (!form.merchantId) issues.push('Bank merchant');
    if (!form.lenderId) issues.push('Lender');
    if (!form.fineractProductId) issues.push('Fineract product');
    if (!form.chargeCodes.length) issues.push('Charges');
    if (!form.commissionCodes.length) issues.push('Commission');
    if (form.defaultRepayments < form.minimumRepayments || form.defaultRepayments > form.maximumRepayments) issues.push('Repayment range');
    return issues;
  }, [form]);

  const select = useCallback(async (configuration: CommercialConfiguration) => {
    setForm({ ...configuration, channel: configuration.channel || null });
    setSimulation(null);
    try {
      setAudit(await request<AuditEntry[]>(`/api/v1/admin/credit-commercial/configurations/${configuration.id}/audit`));
    } catch { setAudit([]); }
  }, [request]);

  const load = useCallback(async () => {
    setBusy('load');
    try {
      const [meta, rows] = await Promise.all([
        request<Metadata>('/api/v1/admin/credit-commercial/metadata'),
        request<CommercialConfiguration[]>('/api/v1/admin/credit-commercial/configurations'),
      ]);
      setMetadata(meta || emptyMetadata);
      setItems(rows || []);
      if (rows?.length) await select(rows[0]);
      setNotice(null);
    } catch (error) { setNotice({ tone: 'error', text: (error as Error).message }); }
    finally { setBusy(''); }
  }, [request, select]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const set = <K extends keyof CommercialConfiguration>(key: K, value: CommercialConfiguration[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const number = (key: keyof CommercialConfiguration, value: string) => set(key, Number(value) as never);
  const payload = () => ({
    productId: form.productId, countryCode: form.countryCode, currency: form.currency, channel: form.channel || 'ALL',
    environmentScope: form.environmentScope, merchantId: form.merchantId, lenderId: form.lenderId,
    allocationWeight: Number(form.allocationWeight), customerWalletTypeCode: Number(form.customerWalletTypeCode),
    settlementWalletTypeCode: Number(form.settlementWalletTypeCode), fineractTenant: form.fineractTenant,
    fineractProductId: Number(form.fineractProductId), fineractProductName: form.fineractProductName,
    pricingRuleCode: form.pricingRuleCode, interestMethod: form.interestMethod,
    nominalInterestRate: Number(form.nominalInterestRate), interestRatePeriod: form.interestRatePeriod,
    repaymentFrequency: Number(form.repaymentFrequency), repaymentFrequencyType: form.repaymentFrequencyType,
    minimumRepayments: Number(form.minimumRepayments), defaultRepayments: Number(form.defaultRepayments),
    maximumRepayments: Number(form.maximumRepayments), processingFeeType: form.processingFeeType,
    processingFeeValue: Number(form.processingFeeValue), lateFeeType: form.lateFeeType,
    lateFeeValue: Number(form.lateFeeValue), earlySettlementAllowed: form.earlySettlementAllowed,
    earlySettlementFeeType: form.earlySettlementFeeType, earlySettlementFeeValue: Number(form.earlySettlementFeeValue),
    chargeCodes: form.chargeCodes, commissionCodes: form.commissionCodes, sourceReference: form.sourceReference,
  });

  const save = async () => {
    setBusy('save');
    try {
      const next = form.id
        ? await request<CommercialConfiguration>(`/api/v1/admin/credit-commercial/configurations/${form.id}`, {
            method: 'PUT', body: { ...payload(), expectedRevision: form.revision },
          })
        : await request<CommercialConfiguration>('/api/v1/admin/credit-commercial/configurations', {
            method: 'POST', body: { ...payload(), code: form.code },
          });
      setNotice({ tone: 'success', text: `Version ${next.version} saved atomically at revision ${next.revision}.` });
      await load();
      await select(next);
    } catch (error) { setNotice({ tone: 'error', text: (error as Error).message }); }
    finally { setBusy(''); }
  };

  const transition = async (action: string) => {
    let reason: string | undefined;
    if (action === 'reject') {
      reason = window.prompt('Enter the governed rejection reason') || undefined;
      if (!reason) return;
    }
    setBusy(action);
    try {
      const next = await request<CommercialConfiguration>(
        `/api/v1/admin/credit-commercial/configurations/${form.id}/${action}`,
        { method: 'POST', body: { expectedRevision: form.revision, reason } },
      );
      setNotice({ tone: 'success', text: `Configuration moved to ${next.status}.` });
      await load(); await select(next);
    } catch (error) { setNotice({ tone: 'error', text: (error as Error).message }); }
    finally { setBusy(''); }
  };

  const simulate = async () => {
    setBusy('simulate');
    try {
      setSimulation(await request<Simulation>('/api/v1/admin/credit-commercial/simulate', {
        method: 'POST', body: { productId: form.productId, countryCode: form.countryCode,
          currency: form.currency, channel: form.channel || 'APP', environmentScope: form.environmentScope,
          principal: Number(principal) },
      }));
    } catch (error) { setNotice({ tone: 'error', text: (error as Error).message }); }
    finally { setBusy(''); }
  };

  return (
    <section className={styles.workspace}>
      <header className={styles.hero}>
        <div><span>LENDING CONTROL / GOVERNED CONFIGURATION</span><h1>Commercial configuration studio</h1>
          <p>Bind the credit policy to a bank, wallets, Fineract product, pricing, fees, commission and channel through one audited workflow.</p></div>
        <div className={styles.heroActions}>
          <button className={styles.secondary} onClick={() => void load()} disabled={Boolean(busy)}><RefreshCw /> Refresh</button>
          <button className={styles.primary} onClick={() => { setForm(blank()); setAudit([]); }} disabled={!canMake}><Plus /> New version</button>
        </div>
      </header>

      {notice && <div className={`${styles.notice} ${styles[notice.tone]}`}>{notice.tone === 'error' ? <AlertTriangle /> : <CheckCircle2 />}{notice.text}</div>}
      <div className={styles.environmentBanner}><ShieldCheck /><div><strong>{form.environmentScope} boundary</strong>
        <span>{form.environmentScope === 'TEST' ? 'Visible to the simulator; production credit decisions cannot consume it.' : 'Can be consumed by live credit decisions only after maker–checker activation.'}</span></div>
        <b className={styles.status}>{form.status.replaceAll('_', ' ')}</b></div>

      <div className={styles.layout}>
        <aside className={styles.rail}>
          <div className={styles.railTitle}><span>CONFIGURATIONS</span><b>{items.length}</b></div>
          {busy === 'load' && <div className={styles.loading}><LoaderCircle /> Loading controls</div>}
          {items.map((item) => <button key={item.id} className={`${styles.record} ${item.id === form.id ? styles.selected : ''}`} onClick={() => void select(item)}>
            <span><Landmark /> {item.merchantCode || 'Unassigned bank'}</span><strong>{item.code}</strong>
            <small>v{item.version} · {item.countryCode} · {item.currency} · {item.channel || 'ALL CHANNELS'}</small>
            <em>{item.environmentScope} / {item.status.replaceAll('_', ' ')}</em>
          </button>)}
          {!items.length && busy !== 'load' && <p className={styles.empty}>No commercial configurations found.</p>}
        </aside>

        <main className={styles.editor}>
          <div className={styles.editorTop}>
            <div><span>CONFIGURATION IDENTITY</span><input value={form.code} disabled={Boolean(form.id)} onChange={(event) => set('code', event.target.value.toUpperCase())} /></div>
            <div className={styles.readiness}><i className={readiness.length ? styles.warnDot : styles.readyDot} />
              <p><strong>{readiness.length ? `${readiness.length} readiness issue${readiness.length > 1 ? 's' : ''}` : 'Ready for governance'}</strong>
              <small>{readiness.length ? readiness.join(', ') : 'Required commercial controls are populated'}</small></p></div>
          </div>

          <div className={styles.grid}>
            <fieldset><legend><Landmark /> Market & lender</legend>
              <label>Environment<select value={form.environmentScope} disabled={!editable} onChange={(e) => set('environmentScope', e.target.value as 'TEST' | 'PRODUCTION')}><option>TEST</option><option>PRODUCTION</option></select></label>
              <div className={styles.row}><label>Country<select value={form.countryCode} disabled={!editable} onChange={(e) => set('countryCode', e.target.value)}>{metadata.countries.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>Currency<select value={form.currency} disabled={!editable} onChange={(e) => set('currency', e.target.value)}>{metadata.currencies.map((x) => <option key={x}>{x}</option>)}</select></label></div>
              <label>Channel<select value={form.channel || 'ALL'} disabled={!editable} onChange={(e) => set('channel', e.target.value === 'ALL' ? null : e.target.value)}><option value="ALL">All channels</option>{metadata.channels.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select></label>
              <label>Bank merchant<select value={form.merchantId} disabled={!editable} onChange={(e) => { set('merchantId', e.target.value); set('lenderId', ''); }}><option value="">Select bank</option>{metadata.merchants.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></label>
              <label>Lender<select value={form.lenderId} disabled={!editable} onChange={(e) => set('lenderId', e.target.value)}><option value="">Select lender</option>{lenders.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></label>
              <label>Allocation weight<input type="number" min="0.000001" step="0.1" value={form.allocationWeight} disabled={!editable} onChange={(e) => number('allocationWeight', e.target.value)} /></label>
            </fieldset>

            <fieldset><legend><CircleDollarSign /> Product & Fineract</legend>
              <label>Finify credit product<select value={form.productId} disabled={!editable} onChange={(e) => set('productId', e.target.value)}>{metadata.creditProducts.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select></label>
              <div className={styles.row}><label>Fineract tenant<input value={form.fineractTenant} disabled={!editable} onChange={(e) => set('fineractTenant', e.target.value)} /></label>
              <label>Fineract product ID<input type="number" min="1" value={form.fineractProductId} disabled={!editable} onChange={(e) => number('fineractProductId', e.target.value)} /></label></div>
              <label>Fineract product name<input value={form.fineractProductName} disabled={!editable} onChange={(e) => set('fineractProductName', e.target.value)} /></label>
              <label>Pricing rule code<input value={form.pricingRuleCode} disabled={!editable} onChange={(e) => set('pricingRuleCode', e.target.value.toUpperCase())} /></label>
              <div className={styles.row}><label>Customer wallet<select value={form.customerWalletTypeCode} disabled={!editable} onChange={(e) => number('customerWalletTypeCode', e.target.value)}>{metadata.customerWalletTypes.map((x) => <option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}</select></label>
              <label>Bank settlement wallet<select value={form.settlementWalletTypeCode} disabled={!editable} onChange={(e) => number('settlementWalletTypeCode', e.target.value)}>{metadata.settlementWalletTypes.map((x) => <option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}</select></label></div>
            </fieldset>

            <fieldset><legend><Clock3 /> Interest & repayment</legend>
              <label>Interest method<select value={form.interestMethod} disabled={!editable} onChange={(e) => set('interestMethod', e.target.value as CommercialConfiguration['interestMethod'])}><option value="FLAT">Fixed / flat interest</option><option value="DECLINING_BALANCE">Reducing balance</option><option value="HPA">Hire purchase (HPA)</option><option value="REVOLVING">Revolving credit</option></select></label>
              <div className={styles.row}><label>Nominal rate<input type="number" min="0" step="0.01" value={form.nominalInterestRate} disabled={!editable} onChange={(e) => number('nominalInterestRate', e.target.value)} /></label>
              <label>Rate period<select value={form.interestRatePeriod} disabled={!editable} onChange={(e) => set('interestRatePeriod', e.target.value as CommercialConfiguration['interestRatePeriod'])}><option>DAILY</option><option>MONTHLY</option><option>ANNUAL</option></select></label></div>
              <div className={styles.rateCallout}><b>{form.nominalInterestRate}% {form.interestRatePeriod.toLowerCase()}</b><span>Normalised annual rate: {form.annualInterestRate ?? (form.interestRatePeriod === 'MONTHLY' ? form.nominalInterestRate * 12 : form.nominalInterestRate)}%</span></div>
              <div className={styles.row}><label>Repayment every<input type="number" min="1" value={form.repaymentFrequency} disabled={!editable} onChange={(e) => number('repaymentFrequency', e.target.value)} /></label>
              <label>Frequency<select value={form.repaymentFrequencyType} disabled={!editable} onChange={(e) => set('repaymentFrequencyType', e.target.value as CommercialConfiguration['repaymentFrequencyType'])}><option>DAYS</option><option>WEEKS</option><option>MONTHS</option></select></label></div>
              <div className={styles.row3}><label>Minimum terms<input type="number" min="1" value={form.minimumRepayments} disabled={!editable} onChange={(e) => number('minimumRepayments', e.target.value)} /></label><label>Default terms<input type="number" min="1" value={form.defaultRepayments} disabled={!editable} onChange={(e) => number('defaultRepayments', e.target.value)} /></label><label>Maximum terms<input type="number" min="1" value={form.maximumRepayments} disabled={!editable} onChange={(e) => number('maximumRepayments', e.target.value)} /></label></div>
            </fieldset>

            <fieldset><legend><WalletCards /> Fees & settlement</legend>
              <FeeRow label="Processing fee" type={form.processingFeeType} value={form.processingFeeValue} disabled={!editable} onType={(value) => set('processingFeeType', value)} onValue={(value) => number('processingFeeValue', value)} />
              <FeeRow label="Late-payment fee" type={form.lateFeeType} value={form.lateFeeValue} disabled={!editable} onType={(value) => set('lateFeeType', value)} onValue={(value) => number('lateFeeValue', value)} />
              <label className={styles.switch}><input type="checkbox" checked={form.earlySettlementAllowed} disabled={!editable} onChange={(e) => set('earlySettlementAllowed', e.target.checked)} /><span /> Early settlement allowed</label>
              <FeeRow label="Early-settlement fee" type={form.earlySettlementFeeType} value={form.earlySettlementFeeValue} disabled={!editable} onType={(value) => set('earlySettlementFeeType', value)} onValue={(value) => number('earlySettlementFeeValue', value)} />
              <label>Charge references<input value={form.chargeCodes.join(', ')} disabled={!editable} onChange={(e) => set('chargeCodes', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /><small>Use explicit source prefixes, for example FINERACT:1.</small></label>
              <label>Commission references<input value={form.commissionCodes.join(', ')} disabled={!editable} onChange={(e) => set('commissionCodes', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /><small>Use NONE when zero commission is an approved commercial rule.</small></label>
            </fieldset>
          </div>

          <label className={styles.source}>Source and approval reference<textarea value={form.sourceReference} disabled={!editable} onChange={(e) => set('sourceReference', e.target.value)} /></label>
          <div className={styles.actions}>
            <button className={styles.primary} disabled={!canMake || !editable || Boolean(busy) || readiness.length > 0} onClick={() => void save()}>{busy === 'save' ? <LoaderCircle /> : <Save />} Save atomically</button>
            {form.status === 'DRAFT' && <button disabled={!canMake || Boolean(busy)} onClick={() => void transition('submit')}><Send /> Submit</button>}
            {form.status === 'PENDING_APPROVAL' && <><button disabled={!canCheck || Boolean(busy)} onClick={() => void transition('approve')}><ShieldCheck /> Approve</button><button disabled={!canCheck || Boolean(busy)} onClick={() => void transition('reject')}><AlertTriangle /> Reject</button></>}
            {form.status === 'APPROVED' && <button disabled={!canCheck || Boolean(busy)} onClick={() => void transition('activate')}><CheckCircle2 /> Activate {form.environmentScope.toLowerCase()}</button>}
            {['ACTIVE', 'TEST_ACTIVE'].includes(form.status) && <button disabled={!canCheck || Boolean(busy)} onClick={() => void transition('retire')}><FileClock /> Retire</button>}
          </div>
        </main>
      </div>

      <div className={styles.lowerGrid}>
        <section className={styles.simulator}><div className={styles.panelHeading}><div><span>NON-MUTATING TEST</span><h2>Commercial resolver simulator</h2></div><Play /></div>
          <div className={styles.simulatorForm}><label>Principal<input type="number" min="1" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></label><button className={styles.primary} onClick={() => void simulate()} disabled={Boolean(busy)}><Play /> Resolve offer</button></div>
          {simulation && <div className={`${styles.simulationResult} ${simulation.matched ? styles.matched : styles.unmatched}`}><strong>{simulation.matched ? 'Binding matched' : 'No binding matched'}</strong>
            {simulation.projection ? <div><span>Processing fee <b>{simulation.projection.processingFee?.toLocaleString()} {form.currency}</b></span><span>Late fee <b>{simulation.projection.lateFee?.toLocaleString()} {form.currency}</b></span><span>Early settlement <b>{simulation.projection.earlySettlementFee?.toLocaleString()} {form.currency}</b></span></div> : <p>{simulation.reasonCode}</p>}</div>}
        </section>
        <section className={styles.audit}><div className={styles.panelHeading}><div><span>IMMUTABLE HISTORY</span><h2>Governance trail</h2></div><FileClock /></div>
          <div className={styles.auditList}>{audit.map((entry) => <article key={entry.id}><i /><div><strong>{entry.action.replaceAll('_', ' ')}</strong><span>{entry.actorId}</span>{entry.reason && <p>{entry.reason}</p>}</div><time>{new Date(entry.createdAt).toLocaleString()}</time></article>)}{!audit.length && <p className={styles.empty}>Select a saved configuration to see its audit history.</p>}</div>
        </section>
      </div>
    </section>
  );
}

function FeeRow({ label, type, value, disabled, onType, onValue }: {
  label: string; type: 'FLAT' | 'PERCENT'; value: number; disabled: boolean;
  onType: (value: 'FLAT' | 'PERCENT') => void; onValue: (value: string) => void;
}) {
  return <div className={styles.feeRow}><label>{label}<input type="number" min="0" step="0.01" value={value} disabled={disabled} onChange={(e) => onValue(e.target.value)} /></label><select value={type} disabled={disabled} onChange={(e) => onType(e.target.value as 'FLAT' | 'PERCENT')}><option value="PERCENT">Percent</option><option value="FLAT">Flat amount</option></select></div>;
}
