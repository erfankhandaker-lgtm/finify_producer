'use client';

import {
  ArrowRight,
  Check,
  FileClock,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './ReferenceDataWorkspace.module.css';

type RequestInit = { method?: string; body?: unknown };
export type ReferenceDataRequest = <T>(route: string, init?: RequestInit) => Promise<T>;

type Props = {
  request: ReferenceDataRequest;
  profile: {
    roles?: string[];
    permissions?: string[];
  };
  onOpenAml: () => void;
};

type KeywordRow = {
  keyword: string;
  keywordDescription?: string | null;
  keywordScope?: string | null;
  isFinancial?: boolean;
  chargeable?: string | null;
  kcIdLookup?: string | null;
  commissionable?: string | null;
  kcmIdLookup?: string | null;
  minimumTranAmount?: number | string;
  serviceStatus?: boolean;
  isActive?: boolean;
  pendingRequestId?: string | null;
  pendingAction?: string | null;
};

type WalletTypeRow = {
  walletId: number;
  walletName: string;
  walletDetails?: string | null;
  walletType?: number | null;
  isKycNeeded?: boolean | number;
  defaultCommissionId?: number;
  defaultChargeId?: number;
  isCharge?: boolean;
  fee?: number | string | null;
  hierarchy?: number | null;
  status?: boolean;
  pendingRequestId?: string | null;
  pendingAction?: string | null;
};

type KeywordForm = {
  keyword: string;
  keywordDescription: string;
  keywordScope: string;
  minimumTranAmount: string;
  chargeable: string;
  commissionable: string;
  kcIdLookup: string;
  kcmIdLookup: string;
  isFinancial: boolean;
  serviceStatus: boolean;
  isActive: boolean;
  makerComment: string;
};

type WalletForm = {
  walletId: string;
  walletName: string;
  walletDetails: string;
  walletType: string;
  isKycNeeded: string;
  defaultCommissionId: string;
  defaultChargeId: string;
  isCharge: boolean;
  fee: string;
  hierarchy: string;
  status: boolean;
  makerComment: string;
};

const blankKeyword: KeywordForm = {
  keyword: '',
  keywordDescription: '',
  keywordScope: 'C',
  minimumTranAmount: '1',
  chargeable: 'N',
  commissionable: 'N',
  kcIdLookup: 'S',
  kcmIdLookup: 'S',
  isFinancial: true,
  serviceStatus: true,
  isActive: true,
  makerComment: '',
};

const blankWallet: WalletForm = {
  walletId: '',
  walletName: '',
  walletDetails: '',
  walletType: '100',
  isKycNeeded: '0',
  defaultCommissionId: '1',
  defaultChargeId: '1',
  isCharge: true,
  fee: '0',
  hierarchy: '0',
  status: true,
  makerComment: '',
};

export default function ReferenceDataWorkspace({
  request,
  profile,
  onOpenAml,
}: Props) {
  const [tab, setTab] = useState<'keywords' | 'wallets' | 'aml'>('keywords');
  const [keywords, setKeywords] = useState<KeywordRow[]>([]);
  const [wallets, setWallets] = useState<WalletTypeRow[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [keywordEditor, setKeywordEditor] = useState<{ mode: 'create' | 'edit'; original?: KeywordRow } | null>(null);
  const [walletEditor, setWalletEditor] = useState<{ mode: 'create' | 'edit'; original?: WalletTypeRow } | null>(null);
  const [keywordForm, setKeywordForm] = useState<KeywordForm>(blankKeyword);
  const [walletForm, setWalletForm] = useState<WalletForm>(blankWallet);

  const roles = (profile.roles || []).map((role) => role.toLowerCase());
  const canMake = roles.includes('super_admin')
    || profile.permissions?.includes('reference_data.make') === true;

  const load = useCallback(async () => {
    const loadAll = async <T,>(route: string) => {
      const first = await request<{ data?: T[]; totalPages?: number }>(
        `${route}${route.includes('?') ? '&' : '?'}page=1&limit=200`,
      );
      const pages = Math.max(1, Number(first.totalPages) || 1);
      if (pages === 1) return first.data || [];
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, index) =>
          request<{ data?: T[] }>(
            `${route}${route.includes('?') ? '&' : '?'}page=${index + 2}&limit=200`,
          ),
        ),
      );
      return [...(first.data || []), ...rest.flatMap((page) => page.data || [])];
    };
    setBusy('load');
    try {
      const [keywordRows, walletRows] = await Promise.all([
        loadAll<KeywordRow>('/admin/reference-data/keywords?search='),
        loadAll<WalletTypeRow>('/admin/reference-data/wallet-types?search='),
      ]);
      setKeywords(keywordRows);
      setWallets(walletRows);
      setMessage(null);
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy('');
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleKeywords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return keywords.filter((row) =>
      `${row.keyword} ${row.keywordDescription || ''} ${row.keywordScope || ''}`
        .toLowerCase()
        .includes(query),
    );
  }, [keywords, search]);
  const visibleWallets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return wallets.filter((row) =>
      `${row.walletId} ${row.walletName} ${row.walletDetails || ''}`
        .toLowerCase()
        .includes(query),
    );
  }, [wallets, search]);

  const openKeyword = (row?: KeywordRow) => {
    setKeywordForm(row ? {
      keyword: row.keyword,
      keywordDescription: row.keywordDescription || '',
      keywordScope: row.keywordScope || 'C',
      minimumTranAmount: String(row.minimumTranAmount ?? 1),
      chargeable: row.chargeable || 'N',
      commissionable: row.commissionable || 'N',
      kcIdLookup: row.kcIdLookup || 'S',
      kcmIdLookup: row.kcmIdLookup || 'S',
      isFinancial: row.isFinancial !== false,
      serviceStatus: row.serviceStatus !== false,
      isActive: row.isActive !== false,
      makerComment: '',
    } : blankKeyword);
    setKeywordEditor({ mode: row ? 'edit' : 'create', original: row });
  };

  const openWallet = (row?: WalletTypeRow) => {
    setWalletForm(row ? {
      walletId: String(row.walletId),
      walletName: row.walletName,
      walletDetails: row.walletDetails || '',
      walletType: String(row.walletType ?? 100),
      isKycNeeded: row.isKycNeeded === true || Number(row.isKycNeeded) === 1 ? '1' : '0',
      defaultCommissionId: String(row.defaultCommissionId ?? 1),
      defaultChargeId: String(row.defaultChargeId ?? 1),
      isCharge: row.isCharge !== false,
      fee: String(row.fee ?? 0),
      hierarchy: String(row.hierarchy ?? 0),
      status: row.status !== false,
      makerComment: '',
    } : blankWallet);
    setWalletEditor({ mode: row ? 'edit' : 'create', original: row });
  };

  const saveKeyword = async () => {
    if (!keywordForm.keyword.trim() || keywordForm.keyword.length > 5) {
      setMessage({ tone: 'error', text: 'Service keyword must contain between 1 and 5 characters.' });
      return;
    }
    if (
      keywordEditor?.mode === 'create'
      && keywords.some((row) => row.keyword.toUpperCase() === keywordForm.keyword.toUpperCase())
    ) {
      setMessage({ tone: 'error', text: `Service keyword ${keywordForm.keyword.toUpperCase()} already exists.` });
      return;
    }
    setBusy('keyword');
    try {
      const body = {
        keywordDescription: keywordForm.keywordDescription.trim() || undefined,
        keywordScope: keywordForm.keywordScope,
        minimumTranAmount: Number(keywordForm.minimumTranAmount),
        isFinancial: keywordForm.isFinancial,
        chargeable: keywordForm.chargeable,
        kcIdLookup: keywordForm.chargeable === 'Y' ? keywordForm.kcIdLookup : undefined,
        commissionable: keywordForm.commissionable,
        kcmIdLookup: keywordForm.commissionable === 'Y' ? keywordForm.kcmIdLookup : undefined,
        serviceStatus: keywordForm.serviceStatus,
        isActive: keywordForm.isActive,
        makerComment: keywordForm.makerComment.trim() || undefined,
      };
      if (keywordEditor?.mode === 'edit') {
        await request(`/admin/reference-data/keywords/${encodeURIComponent(keywordForm.keyword)}`, {
          method: 'PATCH',
          body,
        });
      } else {
        await request('/admin/reference-data/keywords', {
          method: 'POST',
          body: { keyword: keywordForm.keyword.toUpperCase(), ...body },
        });
      }
      setKeywordEditor(null);
      setMessage({
        tone: 'success',
        text: `Service keyword ${keywordForm.keyword.toUpperCase()} submitted to Approval Center.`,
      });
      await load();
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy('');
    }
  };

  const saveWallet = async () => {
    if (!Number.isInteger(Number(walletForm.walletId)) || Number(walletForm.walletId) < 1 || !walletForm.walletName.trim()) {
      setMessage({ tone: 'error', text: 'Wallet ID and wallet name are required.' });
      return;
    }
    if (
      walletEditor?.mode === 'create'
      && wallets.some((row) => row.walletId === Number(walletForm.walletId))
    ) {
      setMessage({ tone: 'error', text: `Wallet type ${walletForm.walletId} already exists.` });
      return;
    }
    setBusy('wallet');
    try {
      const body = {
        walletName: walletForm.walletName.trim(),
        walletDetails: walletForm.walletDetails.trim() || undefined,
        walletType: Number(walletForm.walletType),
        isKycNeeded: walletForm.isKycNeeded === '1',
        defaultCommissionId: Number(walletForm.defaultCommissionId),
        defaultChargeId: Number(walletForm.defaultChargeId),
        isCharge: walletForm.isCharge,
        fee: Number(walletForm.fee),
        hierarchy: Number(walletForm.hierarchy),
        status: walletForm.status,
        makerComment: walletForm.makerComment.trim() || undefined,
      };
      if (walletEditor?.mode === 'edit') {
        await request(`/admin/reference-data/wallet-types/${walletForm.walletId}`, {
          method: 'PATCH',
          body,
        });
      } else {
        await request('/admin/reference-data/wallet-types', {
          method: 'POST',
          body: { walletId: Number(walletForm.walletId), ...body },
        });
      }
      setWalletEditor(null);
      setMessage({
        tone: 'success',
        text: `Wallet type ${walletForm.walletId} submitted to Approval Center.`,
      });
      await load();
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy('');
    }
  };

  const deactivate = async (kind: 'keyword' | 'wallet', key: string) => {
    const label = kind === 'keyword' ? `service keyword ${key}` : `wallet type ${key}`;
    if (!window.confirm(`Submit ${label} for deactivation? Existing transaction history will be retained.`)) return;
    setBusy(`delete:${kind}:${key}`);
    try {
      await request(
        kind === 'keyword'
          ? `/admin/reference-data/keywords/${encodeURIComponent(key)}`
          : `/admin/reference-data/wallet-types/${key}`,
        {
          method: 'DELETE',
          body: { comment: `Deactivate ${label} from Reference Data workspace` },
        },
      );
      setMessage({ tone: 'success', text: `${label} deactivation submitted to Approval Center.` });
      await load();
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy('');
    }
  };

  return (
    <section className={styles.workspace}>
      <header className={styles.hero}>
        <div>
          <span>CONFIGURATION / REFERENCE DATA</span>
          <h1>Reference data management</h1>
          <p>Govern service definitions, wallet classifications, and AML profiles through maker-checker approval.</p>
        </div>
        <button onClick={() => void load()} disabled={busy === 'load'}>
          {busy === 'load' ? <LoaderCircle className={styles.spin} /> : <ShieldCheck />}
          REFRESH REFERENCE DATA
        </button>
      </header>

      {message && (
        <div className={`${styles.notice} ${styles[message.tone]}`}>
          {message.tone === 'success' ? <Check /> : <ShieldCheck />}
          {message.text}
        </div>
      )}

      <nav className={styles.tabs}>
        <button className={tab === 'keywords' ? styles.activeTab : ''} onClick={() => { setTab('keywords'); setSearch(''); }}>
          <KeyRound /> Service Keywords <span>{keywords.length}</span>
        </button>
        <button className={tab === 'wallets' ? styles.activeTab : ''} onClick={() => { setTab('wallets'); setSearch(''); }}>
          <WalletCards /> Wallet Types <span>{wallets.length}</span>
        </button>
        <button className={tab === 'aml' ? styles.activeTab : ''} onClick={() => { setTab('aml'); setSearch(''); }}>
          <SlidersHorizontal /> AML Profiles
        </button>
      </nav>

      {tab !== 'aml' && (
        <div className={styles.toolbar}>
          <label>
            <Search />
            <input
              value={search}
              placeholder={tab === 'keywords' ? 'Search service keywords' : 'Search wallet types'}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <span>
            {tab === 'keywords' ? visibleKeywords.length : visibleWallets.length} RECORDS
          </span>
          <button
            disabled={!canMake}
            onClick={() => tab === 'keywords' ? openKeyword() : openWallet()}
          >
            <Plus /> {tab === 'keywords' ? 'ADD SERVICE KEYWORD' : 'ADD WALLET TYPE'}
          </button>
        </div>
      )}

      {tab === 'keywords' && (
        <div className={styles.tablePanel}>
          <table>
            <thead><tr><th>KEYWORD</th><th>DESCRIPTION</th><th>SCOPE</th><th>MINIMUM</th><th>PRICING</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {!visibleKeywords.length && <tr><td colSpan={7} className={styles.empty}>No service keywords found.</td></tr>}
              {visibleKeywords.map((row) => (
                <tr key={row.keyword}>
                  <td><strong className={styles.code}>{row.keyword}</strong></td>
                  <td>{row.keywordDescription || '—'}</td>
                  <td>{scopeLabel(row.keywordScope)}</td>
                  <td>{String(row.minimumTranAmount ?? '—')}</td>
                  <td>{row.chargeable === 'Y' ? 'CHARGE' : '—'}{row.commissionable === 'Y' ? ' / COMMISSION' : ''}</td>
                  <td><Status active={row.isActive !== false && row.serviceStatus !== false} pending={row.pendingRequestId} action={row.pendingAction} /></td>
                  <td><RowActions
                    canMake={canMake}
                    pending={Boolean(row.pendingRequestId)}
                    inactive={row.isActive === false}
                    busy={Boolean(busy)}
                    onEdit={() => openKeyword(row)}
                    onDeactivate={() => void deactivate('keyword', row.keyword)}
                  /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'wallets' && (
        <div className={styles.tablePanel}>
          <table>
            <thead><tr><th>WALLET ID</th><th>NAME</th><th>CLASS</th><th>KYC</th><th>DEFAULT PRICING</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {!visibleWallets.length && <tr><td colSpan={7} className={styles.empty}>No wallet types found.</td></tr>}
              {visibleWallets.map((row) => (
                <tr key={row.walletId}>
                  <td><strong className={styles.code}>{row.walletId}</strong></td>
                  <td><div className={styles.primary}><strong>{row.walletName}</strong><small>{row.walletDetails || 'No details'}</small></div></td>
                  <td>{String(row.walletType ?? '—')}</td>
                  <td>{Number(row.isKycNeeded) === 1 ? 'REQUIRED' : 'NOT REQUIRED'}</td>
                  <td>CHG {String(row.defaultChargeId ?? '—')} / COM {String(row.defaultCommissionId ?? '—')}</td>
                  <td><Status active={row.status !== false} pending={row.pendingRequestId} action={row.pendingAction} /></td>
                  <td><RowActions
                    canMake={canMake}
                    pending={Boolean(row.pendingRequestId)}
                    inactive={row.status === false}
                    busy={Boolean(busy)}
                    onEdit={() => openWallet(row)}
                    onDeactivate={() => void deactivate('wallet', String(row.walletId))}
                  /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'aml' && (
        <div className={styles.amlLink}>
          <span><SlidersHorizontal /></span>
          <div>
            <small>VISUAL + MANUAL CONTROL</small>
            <h2>AML profile builder and simulator</h2>
            <p>Select services and wallet types, configure AML parameters, simulate PASS/BLOCK decisions, and submit governed changes.</p>
          </div>
          <button onClick={onOpenAml}>OPEN AML WORKSPACE <ArrowRight /></button>
        </div>
      )}

      {keywordEditor && (
        <Editor title={keywordEditor.mode === 'create' ? 'Add service keyword' : `Update ${keywordForm.keyword}`} onClose={() => setKeywordEditor(null)}>
          <div className={styles.formGrid}>
            <Field label="KEYWORD"><input maxLength={5} disabled={keywordEditor.mode === 'edit'} value={keywordForm.keyword} onChange={(event) => setKeywordForm({ ...keywordForm, keyword: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></Field>
            <Field label="DESCRIPTION"><input maxLength={100} value={keywordForm.keywordDescription} onChange={(event) => setKeywordForm({ ...keywordForm, keywordDescription: event.target.value })} /></Field>
            <Field label="DESTINATION SCOPE"><select value={keywordForm.keywordScope} onChange={(event) => setKeywordForm({ ...keywordForm, keywordScope: event.target.value })}><option value="C">Customer</option><option value="M">Merchant</option><option value="A">Agent</option><option value="S">System</option></select></Field>
            <Field label="MINIMUM TRANSACTION"><input type="number" min=".01" step=".01" value={keywordForm.minimumTranAmount} onChange={(event) => setKeywordForm({ ...keywordForm, minimumTranAmount: event.target.value })} /></Field>
            <Field label="CHARGEABLE"><select value={keywordForm.chargeable} onChange={(event) => setKeywordForm({ ...keywordForm, chargeable: event.target.value })}><option value="N">No</option><option value="Y">Yes</option></select></Field>
            <Field label="CHARGE LOOKUP"><select disabled={keywordForm.chargeable !== 'Y'} value={keywordForm.kcIdLookup} onChange={(event) => setKeywordForm({ ...keywordForm, kcIdLookup: event.target.value })}><option value="S">Source wallet</option><option value="D">Destination wallet</option></select></Field>
            <Field label="COMMISSIONABLE"><select value={keywordForm.commissionable} onChange={(event) => setKeywordForm({ ...keywordForm, commissionable: event.target.value })}><option value="N">No</option><option value="Y">Yes</option></select></Field>
            <Field label="COMMISSION LOOKUP"><select disabled={keywordForm.commissionable !== 'Y'} value={keywordForm.kcmIdLookup} onChange={(event) => setKeywordForm({ ...keywordForm, kcmIdLookup: event.target.value })}><option value="S">Source wallet</option><option value="D">Destination wallet</option></select></Field>
          </div>
          <div className={styles.switches}>
            <Toggle label="FINANCIAL SERVICE" checked={keywordForm.isFinancial} onChange={(value) => setKeywordForm({ ...keywordForm, isFinancial: value })} />
            <Toggle label="SERVICE ENABLED" checked={keywordForm.serviceStatus} onChange={(value) => setKeywordForm({ ...keywordForm, serviceStatus: value })} />
            <Toggle label="ACTIVE" checked={keywordForm.isActive} onChange={(value) => setKeywordForm({ ...keywordForm, isActive: value })} />
          </div>
          <Field label="MAKER COMMENT"><textarea maxLength={2000} value={keywordForm.makerComment} onChange={(event) => setKeywordForm({ ...keywordForm, makerComment: event.target.value })} /></Field>
          <button className={styles.submit} disabled={busy === 'keyword'} onClick={() => void saveKeyword()}>{busy === 'keyword' ? <LoaderCircle className={styles.spin} /> : <FileClock />} SUBMIT FOR APPROVAL</button>
        </Editor>
      )}

      {walletEditor && (
        <Editor title={walletEditor.mode === 'create' ? 'Add wallet type' : `Update wallet ${walletForm.walletId}`} onClose={() => setWalletEditor(null)}>
          <div className={styles.formGrid}>
            <Field label="WALLET ID"><input type="number" min="1" disabled={walletEditor.mode === 'edit'} value={walletForm.walletId} onChange={(event) => setWalletForm({ ...walletForm, walletId: event.target.value })} /></Field>
            <Field label="WALLET NAME"><input maxLength={50} value={walletForm.walletName} onChange={(event) => setWalletForm({ ...walletForm, walletName: event.target.value })} /></Field>
            <Field label="DETAILS"><input maxLength={50} value={walletForm.walletDetails} onChange={(event) => setWalletForm({ ...walletForm, walletDetails: event.target.value })} /></Field>
            <Field label="WALLET CLASS"><input type="number" min="1" value={walletForm.walletType} onChange={(event) => setWalletForm({ ...walletForm, walletType: event.target.value })} /></Field>
            <Field label="KYC"><select value={walletForm.isKycNeeded} onChange={(event) => setWalletForm({ ...walletForm, isKycNeeded: event.target.value })}><option value="0">Not required</option><option value="1">Required</option></select></Field>
            <Field label="DEFAULT CHARGE ID"><input type="number" min="1" value={walletForm.defaultChargeId} onChange={(event) => setWalletForm({ ...walletForm, defaultChargeId: event.target.value })} /></Field>
            <Field label="DEFAULT COMMISSION ID"><input type="number" min="1" value={walletForm.defaultCommissionId} onChange={(event) => setWalletForm({ ...walletForm, defaultCommissionId: event.target.value })} /></Field>
            <Field label="FEE"><input type="number" min="0" step=".01" value={walletForm.fee} onChange={(event) => setWalletForm({ ...walletForm, fee: event.target.value })} /></Field>
            <Field label="HIERARCHY"><input type="number" min="0" value={walletForm.hierarchy} onChange={(event) => setWalletForm({ ...walletForm, hierarchy: event.target.value })} /></Field>
          </div>
          <div className={styles.switches}>
            <Toggle label="APPLY CHARGES" checked={walletForm.isCharge} onChange={(value) => setWalletForm({ ...walletForm, isCharge: value })} />
            <Toggle label="ACTIVE" checked={walletForm.status} onChange={(value) => setWalletForm({ ...walletForm, status: value })} />
          </div>
          <Field label="MAKER COMMENT"><textarea maxLength={2000} value={walletForm.makerComment} onChange={(event) => setWalletForm({ ...walletForm, makerComment: event.target.value })} /></Field>
          <button className={styles.submit} disabled={busy === 'wallet'} onClick={() => void saveWallet()}>{busy === 'wallet' ? <LoaderCircle className={styles.spin} /> : <FileClock />} SUBMIT FOR APPROVAL</button>
        </Editor>
      )}
    </section>
  );
}

function Editor({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className={styles.editorLayer}>
      <button className={styles.scrim} onClick={onClose} aria-label="Close editor" />
      <aside>
        <header><div><span>REFERENCE DATA MAKER</span><h2>{title}</h2></div><button onClick={onClose}><X /></button></header>
        {children}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className={styles.toggle}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span><i /></span>{label}</label>;
}

function Status({ active, pending, action }: { active: boolean; pending?: string | null; action?: string | null }) {
  if (pending) return <span className={`${styles.status} ${styles.pending}`}>PENDING {action || 'CHANGE'}</span>;
  return <span className={`${styles.status} ${active ? styles.active : styles.inactive}`}>{active ? 'ACTIVE' : 'INACTIVE'}</span>;
}

function RowActions({
  canMake,
  pending,
  inactive,
  busy,
  onEdit,
  onDeactivate,
}: {
  canMake: boolean;
  pending: boolean;
  inactive: boolean;
  busy: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  return (
    <div className={styles.actions}>
      <button disabled={!canMake || pending || busy} onClick={onEdit}><Pencil /> EDIT</button>
      <button disabled={!canMake || pending || inactive || busy} onClick={onDeactivate}><Trash2 /> DEACTIVATE</button>
    </div>
  );
}

function scopeLabel(value?: string | null) {
  return ({ C: 'CUSTOMER', M: 'MERCHANT', A: 'AGENT', S: 'SYSTEM' } as Record<string, string>)[String(value)] || '—';
}
