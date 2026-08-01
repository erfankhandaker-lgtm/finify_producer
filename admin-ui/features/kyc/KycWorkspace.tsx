'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './KycWorkspace.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/finify';

type Profile = { roles?: string[]; permissions?: string[] };
type CaseRow = {
  id: string;
  customerMsisdn: string;
  documentType: string;
  issuingCountry: string;
  status: string;
  systemRecommendation?: string;
  faceMatchScore?: number | string;
  amlMatch: boolean;
  createdAt: string;
  documents?: Array<{ id: string; role: string; originalName: string }>;
  audit?: Array<{ action: string; reason: string; actor: string; createdAt: string }>;
  extractedData?: Record<string, unknown>;
};
type SanctionsStatus = {
  totalRecords: number;
  lastSuccessfulSync?: string;
  syncing: boolean;
  sources: Array<{ source: string; count: number; updatedAt?: string }>;
  history: Array<{
    id: string; mode: string; source: string; status: string;
    recordsReceived: number; recordsApplied: number; fileName?: string;
    actor: string; error?: string; startedAt: string; completedAt?: string;
  }>;
};

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/admin/operations/kyc/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      ...init?.headers,
    },
  });
  const raw = await response.json().catch(() => ({}));
  const payload = raw.payload ?? raw;
  if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(', ') : payload.message || 'KYC request failed');
  return payload;
}

export default function KycWorkspace({ token, profile }: { token: string; profile: Profile }) {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<CaseRow | null>(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ customerMsisdn: '', documentType: 'UGANDA_NATIONAL_ID', issuingCountry: 'UGA' });
  const [reason, setReason] = useState('');
  const [sanctions, setSanctions] = useState<SanctionsStatus | null>(null);
  const [sanctionsBusy, setSanctionsBusy] = useState(false);
  const [listName, setListName] = useState('LOCAL_WATCHLIST');
  const [uploadMode, setUploadMode] = useState('REPLACE');
  const [listFile, setListFile] = useState<File | null>(null);
  const canOperate = profile.roles?.includes('super_admin') || profile.permissions?.includes('kyc.operate');
  const canReview = profile.roles?.includes('super_admin') || profile.permissions?.includes('kyc.review');
  const canViewDocuments = profile.roles?.includes('super_admin') || profile.permissions?.includes('kyc.documents.read');
  const canConfigure = profile.roles?.includes('super_admin') || profile.permissions?.includes('kyc.configure');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (status) params.set('status', status);
      if (search.trim()) params.set('customerMsisdn', search.trim());
      const result = await request<{ data: CaseRow[]; totalRecords: number }>(`cases?${params}`, token);
      setRows(result.data || []);
      setTotal(result.totalRecords || 0);
    } catch (next) {
      setError((next as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, status, token]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const loadSanctions = useCallback(async () => {
    try { setSanctions(await request<SanctionsStatus>('sanctions/status', token)); }
    catch (next) { setError((next as Error).message); }
  }, [token]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadSanctions(), 0);
    return () => window.clearTimeout(initial);
  }, [loadSanctions]);

  const syncOfficial = async () => {
    setSanctionsBusy(true); setError(''); setMessage('');
    try {
      const result = await request<{ recordsApplied: number }>('sanctions/sync', token, { method: 'POST', body: '{}' });
      setMessage(`Official sanctions sync completed: ${result.recordsApplied.toLocaleString()} records applied.`);
      await loadSanctions();
    } catch (next) { setError((next as Error).message); await loadSanctions(); }
    finally { setSanctionsBusy(false); }
  };

  const uploadManualList = async () => {
    if (!listFile) { setError('Select a CSV sanctions file.'); return; }
    const data = new FormData();
    data.set('listName', listName);
    data.set('mode', uploadMode);
    data.set('file', listFile);
    setSanctionsBusy(true); setError(''); setMessage('');
    try {
      const result = await request<{ source: string; recordsApplied: number }>('sanctions/upload', token, { method: 'POST', body: data });
      setMessage(`${result.source} uploaded: ${result.recordsApplied.toLocaleString()} records applied.`);
      setListFile(null);
      await loadSanctions();
    } catch (next) { setError((next as Error).message); await loadSanctions(); }
    finally { setSanctionsBusy(false); }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(['name,record_id\nExample Person,LOCAL-001\n'], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'finify-sanctions-template.csv'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const open = async (id: string) => {
    setError('');
    try { setSelected(await request<CaseRow>(`cases/${id}`, token)); }
    catch (next) { setError((next as Error).message); }
  };

  const create = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const created = await request<CaseRow>('cases', token, {
        method: 'POST',
        body: JSON.stringify({ ...form, idempotencyKey: `ADMIN-${form.customerMsisdn}-${Date.now()}` }),
      });
      setSelected(created); setShowCreate(false); setMessage('KYC case created.');
      await load();
    } catch (next) { setError((next as Error).message); }
    finally { setBusy(false); }
  };

  const upload = async (role: string, file?: File) => {
    if (!selected || !file) return;
    const data = new FormData();
    data.set('role', role);
    data.set('file', file);
    setBusy(true); setError(''); setMessage('');
    try {
      await request(`cases/${selected.id}/documents`, token, { method: 'POST', body: data });
      await open(selected.id); setMessage(`${role.replaceAll('_', ' ')} uploaded securely.`);
    } catch (next) { setError((next as Error).message); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    if (!selected) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await request<CaseRow>(`cases/${selected.id}/verify`, token, { method: 'POST', body: '{}' });
      setSelected(result); setMessage('OCR and face verification completed. Case is ready for review.');
      await load();
    } catch (next) { setError((next as Error).message); await open(selected.id); }
    finally { setBusy(false); }
  };

  const review = async (action: 'APPROVE' | 'REJECT' | 'REQUEST_RESUBMISSION') => {
    if (!selected || reason.trim().length < 3) { setError('A review reason of at least three characters is required.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await request<CaseRow>(`cases/${selected.id}/review`, token, {
        method: 'PATCH',
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      setSelected(result); setReason(''); setMessage('Review decision recorded in the audit trail.');
      await load();
    } catch (next) { setError((next as Error).message); }
    finally { setBusy(false); }
  };

  const viewDocument = async (documentId: string) => {
    if (!selected) return;
    try {
      const result = await request<{ url: string }>(`cases/${selected.id}/documents/${documentId}/url`, token);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (next) { setError((next as Error).message); }
  };

  const metrics = useMemo(() => ({
    review: rows.filter((row) => row.status === 'MANUAL_REVIEW').length,
    approved: rows.filter((row) => row.status === 'APPROVED').length,
    rejected: rows.filter((row) => row.status === 'REJECTED').length,
  }), [rows]);

  return (
    <section className={styles.workspace}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>IDENTITY CONTROL</span><h1>KYC & identity</h1><p>Customer-linked document verification, biometric evidence, screening, and maker-checker review.</p></div>
        <div className={styles.actions}><button className={styles.secondary} onClick={() => void load()}>Refresh</button>{canOperate && <button className={styles.button} onClick={() => setShowCreate((value) => !value)}>New KYC case</button>}</div>
      </header>

      <div className={styles.panel}>
        <div className={styles.header}>
          <div><span className={styles.eyebrow}>SCREENING LISTS</span><h2>Sanctions data</h2><p>Atomic official synchronisation and controlled manual watchlists. Active screening continues on the previous dataset if an import fails.</p></div>
          <div className={styles.actions}><button className={styles.secondary} onClick={() => void loadSanctions()}>Refresh status</button>{canConfigure && <button className={styles.button} disabled={sanctionsBusy || sanctions?.syncing} onClick={() => void syncOfficial()}>{sanctionsBusy || sanctions?.syncing ? 'Synchronising…' : 'Sync OFAC & UN'}</button>}</div>
        </div>
        <div className={styles.metrics}>
          <div className={styles.metric}><span>Active records</span><strong>{sanctions?.totalRecords?.toLocaleString() || '—'}</strong></div>
          {(sanctions?.sources || []).slice(0, 3).map((source) => <div className={styles.metric} key={source.source}><span>{source.source.replaceAll('_', ' ')}</span><strong>{Number(source.count).toLocaleString()}</strong></div>)}
        </div>
        {canConfigure && <div className={styles.formGrid}>
          <label className={styles.field}><span className={styles.label}>Manual list name</span><input value={listName} maxLength={32} onChange={(event) => setListName(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} /></label>
          <label className={styles.field}><span className={styles.label}>Import mode</span><select value={uploadMode} onChange={(event) => setUploadMode(event.target.value)}><option value="REPLACE">Replace this manual list</option><option value="MERGE">Merge/update records</option></select></label>
          <label className={styles.field}><span className={styles.label}>CSV file</span><input type="file" accept=".csv,text/csv" onChange={(event) => setListFile(event.target.files?.[0] || null)} /></label>
          <div className={styles.actions}><button className={styles.secondary} onClick={downloadTemplate}>Download CSV template</button><button className={styles.button} disabled={sanctionsBusy || !listFile || !listName} onClick={() => void uploadManualList()}>Upload manual list</button></div>
        </div>}
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Run</th><th>Source</th><th>Status</th><th>Records</th><th>Actor</th><th>Started</th></tr></thead><tbody>
          {sanctions?.history?.length ? sanctions.history.slice(0, 8).map((run) => <tr key={run.id}><td>{run.mode.replaceAll('_', ' ')}</td><td>{run.source}</td><td><span className={styles.status}>{run.status}</span></td><td>{Number(run.recordsApplied || 0).toLocaleString()}</td><td>{run.actor}</td><td>{new Date(run.startedAt).toLocaleString()}</td></tr>) : <tr><td colSpan={6} className={styles.empty}>No synchronisation audit history yet.</td></tr>}
        </tbody></table></div>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}><span>Total cases</span><strong>{total}</strong></div>
        <div className={styles.metric}><span>Manual review</span><strong>{metrics.review}</strong></div>
        <div className={styles.metric}><span>Approved in view</span><strong>{metrics.approved}</strong></div>
        <div className={styles.metric}><span>Rejected in view</span><strong>{metrics.rejected}</strong></div>
      </div>

      {showCreate && <div className={styles.panel}>
        <div className={styles.formGrid}>
          <label className={styles.field}><span className={styles.label}>Customer MSISDN</span><input value={form.customerMsisdn} onChange={(event) => setForm({ ...form, customerMsisdn: event.target.value.replace(/\D/g, '') })} /></label>
          <label className={styles.field}><span className={styles.label}>Document type</span><select value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value })}><option value="UGANDA_NATIONAL_ID">Uganda national ID</option><option value="PASSPORT">Passport</option></select></label>
          <label className={styles.field}><span className={styles.label}>Issuing country</span><input maxLength={3} value={form.issuingCountry} onChange={(event) => setForm({ ...form, issuingCountry: event.target.value.toUpperCase() })} /></label>
        </div>
        <button className={styles.button} disabled={busy || !form.customerMsisdn} onClick={() => void create()}>Create draft</button>
      </div>}

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.success}>{message}</div>}

      <div className={styles.grid}>
        <div className={styles.panel}>
          <div className={styles.filters}>
            <label className={styles.field}><span className={styles.label}>Customer MSISDN</span><input value={search} onChange={(event) => setSearch(event.target.value.replace(/\D/g, ''))} placeholder="Exact MSISDN" /></label>
            <label className={styles.field}><span className={styles.label}>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option>MANUAL_REVIEW</option><option>APPROVED</option><option>REJECTED</option><option>DRAFT</option><option>FAILED</option></select></label>
          </div>
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Customer</th><th>Document</th><th>Status</th><th>Face</th><th>Created</th></tr></thead><tbody>
            {!loading && rows.length === 0 && <tr><td colSpan={5} className={styles.empty}>No KYC cases found.</td></tr>}
            {rows.map((row) => <tr key={row.id} className={selected?.id === row.id ? styles.selected : ''} onClick={() => void open(row.id)}><td>{row.customerMsisdn}</td><td>{row.documentType.replaceAll('_', ' ')}</td><td><span className={styles.status}>{row.status.replaceAll('_', ' ')}</span></td><td>{row.faceMatchScore === null || row.faceMatchScore === undefined ? '—' : `${Number(row.faceMatchScore).toFixed(1)}%`}</td><td>{new Date(row.createdAt).toLocaleString()}</td></tr>)}
          </tbody></table></div>
        </div>

        <aside className={`${styles.panel} ${styles.detail}`}>
          {!selected ? <p className={styles.empty}>Select a KYC case to inspect its protected evidence and audit history.</p> : <>
            <div><span className={styles.eyebrow}>CASE {selected.id.slice(0, 8)}</span><h2>{selected.customerMsisdn}</h2><span className={styles.status}>{selected.status.replaceAll('_', ' ')}</span></div>
            <dl><div><dt>Document</dt><dd>{selected.documentType.replaceAll('_', ' ')}</dd></div><div><dt>Country</dt><dd>{selected.issuingCountry}</dd></div><div><dt>System recommendation</dt><dd>{selected.systemRecommendation || 'Pending'}</dd></div><div><dt>Face score</dt><dd>{selected.faceMatchScore === null || selected.faceMatchScore === undefined ? 'Pending' : `${Number(selected.faceMatchScore).toFixed(2)}%`}</dd></div></dl>
            {canOperate && ['DRAFT', 'RESUBMISSION_REQUIRED'].includes(selected.status) && <div>
              <span className={styles.label}>Protected evidence</span>
              {(['ID_FRONT', 'ID_BACK', 'SELFIE'] as const).map((role) => <label className={styles.document} key={role}><span>{role.replaceAll('_', ' ')}</span><input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={(event) => void upload(role, event.target.files?.[0])} /></label>)}
              <button className={styles.button} disabled={busy} onClick={() => void verify()}>Run verification</button>
            </div>}
            <div><span className={styles.label}>Documents</span>{selected.documents?.length ? selected.documents.map((document) => <div className={styles.document} key={document.id}><span>{document.role.replaceAll('_', ' ')}</span>{canViewDocuments && <button className={styles.secondary} onClick={() => void viewDocument(document.id)}>View 5 min</button>}</div>) : <p className={styles.empty}>No evidence uploaded.</p>}</div>
            {canReview && ['SUBMITTED', 'MANUAL_REVIEW'].includes(selected.status) && <div className={styles.review}><label className={styles.field}><span className={styles.label}>Decision reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className={styles.actions}><button className={styles.button} disabled={busy} onClick={() => void review('APPROVE')}>Approve</button><button className={styles.secondary} disabled={busy} onClick={() => void review('REQUEST_RESUBMISSION')}>Resubmit</button><button className={styles.danger} disabled={busy} onClick={() => void review('REJECT')}>Reject</button></div></div>}
            <div><span className={styles.label}>Audit trail</span>{selected.audit?.slice(0, 6).map((entry, index) => <div className={styles.document} key={`${entry.createdAt}-${index}`}><span>{entry.action}<small> · {entry.actor}</small></span><small>{new Date(entry.createdAt).toLocaleString()}</small></div>)}</div>
          </>}
        </aside>
      </div>
    </section>
  );
}
