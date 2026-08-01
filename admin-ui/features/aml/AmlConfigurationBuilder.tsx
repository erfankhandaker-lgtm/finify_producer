'use client';

import {
  Activity,
  Check,
  ChevronRight,
  ListTree,
  LoaderCircle,
  Play,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  TableProperties,
  WalletCards,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './AmlConfigurationBuilder.module.css';

type RequestInit = { method?: string; body?: unknown };
export type AmlAdminRequest = <T>(route: string, init?: RequestInit) => Promise<T>;

export type AmlConfiguration = {
  walletCode?: number;
  walletName?: string;
  keyword?: string;
  keywordDescription?: string;
  maxTransactionAmount?: number | string;
  dailyMaxAmount?: number | string;
  dailyTransactionCount?: number | string;
  monthlyMaxAmount?: number | string;
  monthlyTransactionCount?: number | string;
  pendingRequestId?: string | null;
  pendingAction?: string | null;
  isActive?: boolean;
};

type Props = {
  request: AmlAdminRequest;
  profile?: {
    roles?: string[];
    permissions?: string[];
  };
  configurations: AmlConfiguration[];
  onSubmitted: () => Promise<void> | void;
};

type KeywordOption = {
  keyword: string;
  keywordDescription?: string;
  isFinancial?: boolean;
  isActive?: boolean;
  serviceStatus?: boolean;
};

type WalletOption = {
  walletId: number;
  walletName: string;
  walletDetails?: string;
  status?: boolean;
};

type PendingRequest = {
  id: string;
  resourceKey: string;
  action: string;
  makerUsername?: string;
};

type LimitDraft = {
  maxTransactionAmount: string;
  dailyMaxAmount: string;
  dailyTransactionCount: string;
  monthlyMaxAmount: string;
  monthlyTransactionCount: string;
};

type SimulationInput = {
  transactionAmount: string;
  dailyAmountUsed: string;
  dailyTransactionUsed: string;
  monthlyAmountUsed: string;
  monthlyTransactionUsed: string;
};

type AmlSimulation = {
  success: boolean;
  decision: 'PASS' | 'BLOCK';
  statusCode: string;
  statusMessage: string;
  projectedUsage: {
    dailyAmount: number;
    dailyTransactionCount: number;
    monthlyAmount: number;
    monthlyTransactionCount: number;
  };
  checks: Array<{
    code: string;
    label: string;
    used: number;
    limit: number;
    passed: boolean;
    remaining: number;
  }>;
};

const defaultLimits: LimitDraft = {
  maxTransactionAmount: '5000',
  dailyMaxAmount: '25000',
  dailyTransactionCount: '25',
  monthlyMaxAmount: '250000',
  monthlyTransactionCount: '250',
};

export default function AmlConfigurationBuilder({
  request,
  profile,
  configurations,
  onSubmitted,
}: Props) {
  const [mode, setMode] = useState<'visual' | 'manual'>('visual');
  const [keywords, setKeywords] = useState<KeywordOption[]>([]);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [selectedWallets, setSelectedWallets] = useState<number[]>([]);
  const [limits, setLimits] = useState<LimitDraft>(defaultLimits);
  const [makerComment, setMakerComment] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [walletSearch, setWalletSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [simulationKeyword, setSimulationKeyword] = useState('');
  const [simulationWallet, setSimulationWallet] = useState('');
  const [simulationInput, setSimulationInput] = useState<SimulationInput>({
    transactionAmount: '1000',
    dailyAmountUsed: '0',
    dailyTransactionUsed: '0',
    monthlyAmountUsed: '0',
    monthlyTransactionUsed: '0',
  });
  const [simulation, setSimulation] = useState<AmlSimulation | null>(null);
  const [message, setMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadReferenceData = useCallback(async () => {
    const loadAll = async <T,>(route: string) => {
      const first = await request<{ data?: T[]; totalPages?: number }>(
        `${route}${route.includes('?') ? '&' : '?'}page=1&limit=200`,
      );
      const totalPages = Math.max(1, Number(first.totalPages) || 1);
      if (totalPages === 1) return first.data || [];
      const pages = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          request<{ data?: T[] }>(
            `${route}${route.includes('?') ? '&' : '?'}page=${index + 2}&limit=200`,
          ),
        ),
      );
      return [...(first.data || []), ...pages.flatMap((page) => page.data || [])];
    };

    try {
      const [keywordRows, walletRows, pendingRows] = await Promise.all([
        loadAll<KeywordOption>('/admin/reference-data/keywords?search='),
        loadAll<WalletOption>('/admin/reference-data/wallet-types?search='),
        loadAll<PendingRequest>(
          '/admin/reference-data/change-requests?resourceType=AML&status=PENDING',
        ),
      ]);
      const activeKeywords = keywordRows.filter(
        (row) => row.isActive !== false && row.serviceStatus !== false,
      );
      const financialKeywords = activeKeywords.filter((row) => row.isFinancial !== false);
      setKeywords(financialKeywords.length ? financialKeywords : activeKeywords);
      setWallets(walletRows.filter((row) => row.status !== false));
      setPendingRequests(pendingRows);
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReferenceData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReferenceData]);

  const existingByKey = useMemo(
    () =>
      new Map(
        configurations.map((row) => [
          `${Number(row.walletCode)}:${String(row.keyword || '').toUpperCase()}`,
          row,
        ]),
      ),
    [configurations],
  );
  const pendingKeys = useMemo(
    () => new Set(pendingRequests.map((row) => row.resourceKey.toUpperCase())),
    [pendingRequests],
  );
  const combinations = useMemo(
    () =>
      selectedWallets.flatMap((walletCode) =>
        selectedKeywords.map((keyword) => ({
          walletCode,
          keyword,
          key: `${walletCode}:${keyword.toUpperCase()}`,
        })),
      ),
    [selectedKeywords, selectedWallets],
  );
  const identicalCombinations = combinations.filter((row) => {
    const existing = existingByKey.get(row.key);
    return existing ? sameAmlLimits(existing, limits) : false;
  });
  const identicalKeys = new Set(identicalCombinations.map((row) => row.key));
  const actionableCombinations = combinations.filter((row) => !identicalKeys.has(row.key));
  const createCount = actionableCombinations.filter((row) => !existingByKey.has(row.key)).length;
  const updateCount = actionableCombinations.length - createCount;
  const blockedCombinations = actionableCombinations.filter((row) => pendingKeys.has(row.key));

  const roles = (profile?.roles || []).map((role) => role.toLowerCase());
  const isSuperAdmin = roles.some((role) =>
    ['super_admin', 'superadmin', 'super admin'].includes(role),
  );
  const canMake =
    isSuperAdmin || profile?.permissions?.includes('reference_data.make') === true;

  const validation = useMemo(() => validateLimits(limits), [limits]);

  const submit = async () => {
    if (!canMake) {
      setMessage({
        tone: 'error',
        text: 'This account does not have permission to submit AML configuration changes.',
      });
      return;
    }
    if (!selectedKeywords.length || !selectedWallets.length) {
      setMessage({
        tone: 'error',
        text: 'Select at least one service and one wallet before submitting.',
      });
      return;
    }
    if (validation.length) {
      setMessage({ tone: 'error', text: validation[0] });
      return;
    }
    if (!actionableCombinations.length) {
      setMessage({
        tone: 'error',
        text: 'The selected AML rule already exists with identical parameters. Nothing new was submitted.',
      });
      return;
    }
    if (blockedCombinations.length) {
      setMessage({
        tone: 'error',
        text: `${blockedCombinations.length} selected profile(s) already have a pending approval request. Remove them from the selection or complete their review first.`,
      });
      return;
    }

    const numericLimits = {
      maxTransactionAmount: Number(limits.maxTransactionAmount),
      dailyMaxAmount: Number(limits.dailyMaxAmount),
      dailyTransactionCount: Number(limits.dailyTransactionCount),
      monthlyMaxAmount: Number(limits.monthlyMaxAmount),
      monthlyTransactionCount: Number(limits.monthlyTransactionCount),
      isActive: true,
      ...(makerComment.trim() ? { makerComment: makerComment.trim() } : {}),
    };
    let submitted = 0;
    const failures: string[] = [];
    setBusy(true);
    setMessage(null);
    for (const combination of actionableCombinations) {
      try {
        if (existingByKey.has(combination.key)) {
          await request(
            `/admin/reference-data/aml-configurations/${combination.walletCode}/${encodeURIComponent(combination.keyword)}`,
            { method: 'PATCH', body: numericLimits },
          );
        } else {
          await request('/admin/reference-data/aml-configurations', {
            method: 'POST',
            body: {
              walletCode: combination.walletCode,
              keyword: combination.keyword,
              ...numericLimits,
            },
          });
        }
        submitted += 1;
      } catch (error) {
        failures.push(`${combination.key}: ${(error as Error).message}`);
      }
    }

    await Promise.resolve(onSubmitted());
    await loadReferenceData();
    setBusy(false);
    if (failures.length) {
      setMessage({
        tone: 'error',
        text: `${submitted} of ${actionableCombinations.length} AML requests were submitted. ${failures[0]}`,
      });
      return;
    }
    setMessage({
      tone: 'success',
      text: `${submitted} AML configuration request${submitted === 1 ? '' : 's'} submitted${identicalCombinations.length ? `; ${identicalCombinations.length} identical existing rule${identicalCombinations.length === 1 ? ' was' : 's were'} skipped` : ''}. A different authorized user can review the new requests in Approval Center.`,
    });
  };

  const effectiveSimulationKeyword = selectedKeywords.includes(simulationKeyword)
    ? simulationKeyword
    : selectedKeywords[0] || '';
  const effectiveSimulationWallet = selectedWallets.includes(Number(simulationWallet))
    ? simulationWallet
    : selectedWallets[0] ? String(selectedWallets[0]) : '';

  const runSimulation = async () => {
    if (!effectiveSimulationKeyword || !effectiveSimulationWallet) {
      setMessage({
        tone: 'error',
        text: 'Select at least one service and wallet before running the AML simulation.',
      });
      return;
    }
    if (validation.length) {
      setMessage({ tone: 'error', text: validation[0] });
      return;
    }
    setSimulationBusy(true);
    setSimulation(null);
    try {
      const result = await request<AmlSimulation>(
        '/admin/reference-data/aml-configurations/simulate',
        {
          method: 'POST',
          body: {
            walletCode: Number(effectiveSimulationWallet),
            keyword: effectiveSimulationKeyword,
            maxTransactionAmount: Number(limits.maxTransactionAmount),
            dailyMaxAmount: Number(limits.dailyMaxAmount),
            dailyTransactionCount: Number(limits.dailyTransactionCount),
            monthlyMaxAmount: Number(limits.monthlyMaxAmount),
            monthlyTransactionCount: Number(limits.monthlyTransactionCount),
            transactionAmount: Number(simulationInput.transactionAmount),
            dailyAmountUsed: Number(simulationInput.dailyAmountUsed),
            dailyTransactionUsed: Number(simulationInput.dailyTransactionUsed),
            monthlyAmountUsed: Number(simulationInput.monthlyAmountUsed),
            monthlyTransactionUsed: Number(simulationInput.monthlyTransactionUsed),
          },
        },
      );
      setSimulation(result);
      setMessage(null);
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setSimulationBusy(false);
    }
  };

  const filteredKeywords = keywords.filter((row) =>
    `${row.keyword} ${row.keywordDescription || ''}`
      .toLowerCase()
      .includes(serviceSearch.trim().toLowerCase()),
  );
  const filteredWallets = wallets.filter((row) =>
    `${row.walletId} ${row.walletName} ${row.walletDetails || ''}`
      .toLowerCase()
      .includes(walletSearch.trim().toLowerCase()),
  );

  return (
    <section className={styles.builder}>
      <header className={styles.header}>
        <div>
          <span>AML POLICY MAKER</span>
          <h2>AML parameter builder</h2>
          <p>Select services, choose one or more wallets, then apply the governed AML limits.</p>
        </div>
        <div className={styles.modeSwitch} aria-label="AML editor mode">
          <button
            className={mode === 'visual' ? styles.activeMode : ''}
            onClick={() => setMode('visual')}
          >
            <ListTree /> Visual
          </button>
          <button
            className={mode === 'manual' ? styles.activeMode : ''}
            onClick={() => setMode('manual')}
          >
            <TableProperties /> Manual
          </button>
        </div>
      </header>

      {message && (
        <div className={`${styles.notice} ${styles[message.tone]}`}>
          {message.tone === 'success' ? <Check /> : <ShieldCheck />}
          <span>{message.text}</span>
        </div>
      )}

      {mode === 'visual' ? (
        <div className={styles.visualFlow}>
          <ScopeSelector
            step="01"
            eyebrow="SERVICES"
            title="Select services"
            icon={<Zap />}
            search={serviceSearch}
            onSearch={setServiceSearch}
            selected={selectedKeywords}
            options={filteredKeywords.map((row) => ({
              value: row.keyword,
              label: row.keyword,
              detail: row.keywordDescription || 'Financial service',
            }))}
            onChange={setSelectedKeywords}
          />
          <span className={styles.connector}><ChevronRight /></span>
          <ScopeSelector
            step="02"
            eyebrow="WALLET SCOPE"
            title="Wallet or wallets"
            icon={<WalletCards />}
            search={walletSearch}
            onSearch={setWalletSearch}
            selected={selectedWallets.map(String)}
            options={filteredWallets.map((row) => ({
              value: String(row.walletId),
              label: row.walletName,
              detail: `Wallet ${row.walletId}${row.walletDetails ? ` · ${row.walletDetails}` : ''}`,
            }))}
            onChange={(values) => setSelectedWallets(values.map(Number))}
          />
          <span className={styles.connector}><ChevronRight /></span>
          <ParameterEditor
            limits={limits}
            validation={validation}
            onChange={setLimits}
          />
        </div>
      ) : (
        <div className={styles.manualEditor}>
          <div className={styles.manualScopes}>
            <ScopeSelector
              step="01"
              eyebrow="SERVICE CODES"
              title="Services"
              icon={<Zap />}
              search={serviceSearch}
              onSearch={setServiceSearch}
              selected={selectedKeywords}
              options={filteredKeywords.map((row) => ({
                value: row.keyword,
                label: row.keyword,
                detail: row.keywordDescription || 'Financial service',
              }))}
              onChange={setSelectedKeywords}
              compact
            />
            <ScopeSelector
              step="02"
              eyebrow="WALLET CODES"
              title="Wallets"
              icon={<WalletCards />}
              search={walletSearch}
              onSearch={setWalletSearch}
              selected={selectedWallets.map(String)}
              options={filteredWallets.map((row) => ({
                value: String(row.walletId),
                label: `${row.walletId}`,
                detail: row.walletName,
              }))}
              onChange={(values) => setSelectedWallets(values.map(Number))}
              compact
            />
          </div>
          <ParameterEditor
            limits={limits}
            validation={validation}
            onChange={setLimits}
            manual
          />
        </div>
      )}

      <section className={styles.simulator}>
        <div className={styles.simulatorHead}>
          <div>
            <span><Activity /> READ-ONLY TEST</span>
            <h3>AML logic simulator</h3>
            <p>Uses the draft parameters above. It does not reserve capacity or change wallet usage.</p>
          </div>
          <button
            disabled={simulationBusy || !selectedKeywords.length || !selectedWallets.length || Boolean(validation.length)}
            onClick={() => void runSimulation()}
          >
            {simulationBusy ? <LoaderCircle className={styles.spin} /> : <Play />}
            {simulationBusy ? 'SIMULATING…' : 'RUN SIMULATION'}
          </button>
        </div>
        <div className={styles.simulationInputs}>
          <label>
            SERVICE
            <select
              value={effectiveSimulationKeyword}
              onChange={(event) => setSimulationKeyword(event.target.value)}
            >
              {selectedKeywords.map((keyword) => <option key={keyword}>{keyword}</option>)}
            </select>
          </label>
          <label>
            WALLET TYPE
            <select
              value={effectiveSimulationWallet}
              onChange={(event) => setSimulationWallet(event.target.value)}
            >
              {selectedWallets.map((wallet) => <option key={wallet} value={wallet}>{wallet}</option>)}
            </select>
          </label>
          <SimulationField label="TRANSACTION AMOUNT" field="transactionAmount" value={simulationInput} onChange={setSimulationInput} />
          <SimulationField label="DAILY AMOUNT USED" field="dailyAmountUsed" value={simulationInput} onChange={setSimulationInput} />
          <SimulationField label="DAILY TXNS USED" field="dailyTransactionUsed" value={simulationInput} onChange={setSimulationInput} integer />
          <SimulationField label="MONTHLY AMOUNT USED" field="monthlyAmountUsed" value={simulationInput} onChange={setSimulationInput} />
          <SimulationField label="MONTHLY TXNS USED" field="monthlyTransactionUsed" value={simulationInput} onChange={setSimulationInput} integer />
        </div>
        {simulation && (
          <div className={`${styles.simulationResult} ${simulation.success ? styles.pass : styles.block}`}>
            <div className={styles.decision}>
              <span>{simulation.decision}</span>
              <strong>{simulation.statusCode}</strong>
              <small>{simulation.statusMessage}</small>
            </div>
            <div className={styles.checks}>
              {simulation.checks.map((check) => (
                <div key={check.code} className={check.passed ? styles.checkPassed : styles.checkFailed}>
                  <span>{check.passed ? <Check /> : <ShieldCheck />}</span>
                  <div><strong>{check.label}</strong><small>{check.used} used / {check.limit} limit</small></div>
                  <em>{check.passed ? `${check.remaining} LEFT` : 'EXCEEDED'}</em>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <footer className={styles.submitBar}>
        <div className={styles.summary}>
          <ShieldCheck />
          <div>
            <strong>
              {combinations.length
                ? `${combinations.length} generated profile${combinations.length === 1 ? '' : 's'}`
                : 'Select a service and wallet'}
            </strong>
            <span>
              {createCount} create · {updateCount} update · {identicalCombinations.length} already exists · {blockedCombinations.length} pending
            </span>
          </div>
        </div>
        <label className={styles.comment}>
          MAKER COMMENT
          <input
            value={makerComment}
            maxLength={2000}
            placeholder="Reason for this AML limit change"
            onChange={(event) => setMakerComment(event.target.value)}
          />
        </label>
        <button
          className={styles.submitButton}
          disabled={
            busy ||
            !canMake ||
            !actionableCombinations.length ||
            Boolean(validation.length) ||
            Boolean(blockedCombinations.length)
          }
          onClick={() => void submit()}
        >
          {busy ? <LoaderCircle className={styles.spin} /> : <Send />}
          {busy ? 'SUBMITTING…' : 'SUBMIT FOR APPROVAL'}
        </button>
      </footer>
    </section>
  );
}

function ScopeSelector({
  step,
  eyebrow,
  title,
  icon,
  search,
  onSearch,
  selected,
  options,
  onChange,
  compact = false,
}: {
  step: string;
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  search: string;
  onSearch: (value: string) => void;
  selected: string[];
  options: Array<{ value: string; label: string; detail: string }>;
  onChange: (values: string[]) => void;
  compact?: boolean;
}) {
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  };
  const visibleValues = options.map((option) => option.value);
  const allVisibleSelected =
    Boolean(visibleValues.length) && visibleValues.every((value) => selected.includes(value));

  return (
    <section className={`${styles.scopeCard} ${compact ? styles.compact : ''}`}>
      <div className={styles.scopeHead}>
        <span className={styles.step}>{step}</span>
        <span className={styles.scopeIcon}>{icon}</span>
        <div>
          <small>{eyebrow}</small>
          <strong>{title}</strong>
        </div>
        <em>{selected.length} SELECTED</em>
      </div>
      <label className={styles.search}>
        <Search />
        <input
          value={search}
          placeholder={`Search ${title.toLowerCase()}`}
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>
      <button
        className={styles.selectAll}
        type="button"
        disabled={!visibleValues.length}
        onClick={() =>
          onChange(
            allVisibleSelected
              ? selected.filter((value) => !visibleValues.includes(value))
              : [...new Set([...selected, ...visibleValues])],
          )
        }
      >
        {allVisibleSelected ? 'CLEAR VISIBLE' : 'SELECT ALL VISIBLE'}
      </button>
      <div className={styles.optionList}>
        {!options.length && <span className={styles.empty}>No active options found.</span>}
        {options.map((option) => (
          <label
            key={option.value}
            className={selected.includes(option.value) ? styles.selectedOption : ''}
          >
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => toggle(option.value)}
            />
            <span><Check /></span>
            <div>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}

function ParameterEditor({
  limits,
  validation,
  onChange,
  manual = false,
}: {
  limits: LimitDraft;
  validation: string[];
  onChange: (value: LimitDraft) => void;
  manual?: boolean;
}) {
  const fields: Array<{
    key: keyof LimitDraft;
    label: string;
    detail: string;
    step: string;
    integer?: boolean;
  }> = [
    {
      key: 'maxTransactionAmount',
      label: 'Maximum per transaction',
      detail: 'Amount allowed for one transaction',
      step: '0.01',
    },
    {
      key: 'dailyMaxAmount',
      label: 'Daily amount limit',
      detail: 'Combined value allowed per day',
      step: '0.01',
    },
    {
      key: 'dailyTransactionCount',
      label: 'Daily transaction count',
      detail: 'Number of transactions allowed per day',
      step: '1',
      integer: true,
    },
    {
      key: 'monthlyMaxAmount',
      label: 'Monthly amount limit',
      detail: 'Combined value allowed per month',
      step: '0.01',
    },
    {
      key: 'monthlyTransactionCount',
      label: 'Monthly transaction count',
      detail: 'Number of transactions allowed per month',
      step: '1',
      integer: true,
    },
  ];

  return (
    <section className={`${styles.parameterCard} ${manual ? styles.manualParameters : ''}`}>
      <div className={styles.parameterHead}>
        <span className={styles.step}>03</span>
        <span className={styles.scopeIcon}><SlidersHorizontal /></span>
        <div>
          <small>CONTROL LIMITS</small>
          <strong>AML parameters</strong>
        </div>
      </div>
      <div className={styles.parameterFields}>
        {fields.map((field) => (
          <label key={field.key}>
            <span>
              <strong>{field.label}</strong>
              <small>{field.detail}</small>
            </span>
            <input
              type="number"
              min={field.integer ? 1 : 0.01}
              step={field.step}
              value={limits[field.key]}
              onChange={(event) =>
                onChange({ ...limits, [field.key]: event.target.value })
              }
            />
          </label>
        ))}
      </div>
      <div className={`${styles.validation} ${validation.length ? styles.invalid : ''}`}>
        {validation.length ? validation[0] : 'AML limit hierarchy is valid.'}
      </div>
    </section>
  );
}

function SimulationField({
  label,
  field,
  value,
  onChange,
  integer = false,
}: {
  label: string;
  field: keyof SimulationInput;
  value: SimulationInput;
  onChange: (value: SimulationInput) => void;
  integer?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={field === 'transactionAmount' ? (integer ? 1 : 0.01) : 0}
        step={integer ? 1 : 0.01}
        value={value[field]}
        onChange={(event) => onChange({ ...value, [field]: event.target.value })}
      />
    </label>
  );
}

function sameAmlLimits(configuration: AmlConfiguration, limits: LimitDraft) {
  return configuration.isActive !== false
    && Number(configuration.maxTransactionAmount) === Number(limits.maxTransactionAmount)
    && Number(configuration.dailyMaxAmount) === Number(limits.dailyMaxAmount)
    && Number(configuration.dailyTransactionCount) === Number(limits.dailyTransactionCount)
    && Number(configuration.monthlyMaxAmount) === Number(limits.monthlyMaxAmount)
    && Number(configuration.monthlyTransactionCount) === Number(limits.monthlyTransactionCount);
}

function validateLimits(limits: LimitDraft) {
  const maxTransaction = Number(limits.maxTransactionAmount);
  const dailyAmount = Number(limits.dailyMaxAmount);
  const dailyCount = Number(limits.dailyTransactionCount);
  const monthlyAmount = Number(limits.monthlyMaxAmount);
  const monthlyCount = Number(limits.monthlyTransactionCount);
  const values = [maxTransaction, dailyAmount, dailyCount, monthlyAmount, monthlyCount];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return ['All AML parameters must be greater than zero.'];
  }
  if (!Number.isInteger(dailyCount) || !Number.isInteger(monthlyCount)) {
    return ['Daily and monthly transaction counts must be whole numbers.'];
  }
  if (
    Math.abs(maxTransaction * 100 - Math.round(maxTransaction * 100)) > 0.00001 ||
    Math.abs(dailyAmount * 100 - Math.round(dailyAmount * 100)) > 0.00001 ||
    Math.abs(monthlyAmount * 100 - Math.round(monthlyAmount * 100)) > 0.00001
  ) {
    return ['AML amount parameters support no more than two decimal places.'];
  }
  if (maxTransaction > dailyAmount) {
    return ['Maximum per transaction cannot exceed the daily amount limit.'];
  }
  if (dailyAmount > monthlyAmount) {
    return ['Daily amount limit cannot exceed the monthly amount limit.'];
  }
  if (dailyCount > monthlyCount) {
    return ['Daily transaction count cannot exceed the monthly transaction count.'];
  }
  return [];
}
