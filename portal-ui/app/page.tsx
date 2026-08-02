'use client';

import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, Building2,
  Camera, Check, ChevronRight, CircleUserRound, Eye, EyeOff, FileCheck2, Fingerprint,
  History, Home, Landmark, LoaderCircle, LockKeyhole, LogOut, Menu,
  ReceiptText, RefreshCw, ScanFace, Send, ShieldCheck, Smartphone, UploadCloud, WalletCards, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sessionFetch } from '../lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/finify';

type Tab = 'home' | 'wallets' | 'pay' | 'activity' | 'kyc' | 'profile';
type Principal = {
  accountType: 'CUSTOMER' | 'BUSINESS'; ownerType: string; ownerMsisdn: string;
  displayName: string; email?: string; status: number; kycStatus?: number; businessType?: string;
};
type Wallet = {
  walletId: string; accountCode?: string; walletCode: number; walletName?: string;
  balance: number | string; commissionBalance?: number | string; currency: string;
  status: number; isDefault: boolean; purpose?: string; iban?: string; swiftBic?: string;
};
type Activity = {
  id: string; transactionId?: string; walletId: string; debit: number | string;
  credit: number | string; currency: string; keyword?: string; reference?: string;
  sourceWalletId?: string; destinationWalletId?: string; createdAt?: string;
};
type Service = { keyword: string; description?: string; scope?: string };
type Dashboard = {
  principal: Principal; wallets: Wallet[]; balances: Record<string, number>;
  recentActivity: Activity[]; kyc?: { status: string; systemRecommendation?: string } | null;
  kycRequired: boolean; kycComplete: boolean;
  services: Service[];
};

type KycJourney = {
  required: boolean;
  complete: boolean;
  case: {
    id: string; status: string; documentType: string; issuingCountry: string;
    systemRecommendation?: string; faceMatchScore?: number | string;
    screeningSummary?: Record<string, unknown>; finalReason?: string;
    documents: Array<{ role: string; originalName: string; createdAt: string }>;
  } | null;
};

async function api<T>(path: string, token?: string, init?: { method?: string; body?: Record<string, unknown> | FormData }): Promise<T> {
  const multipart = init?.body instanceof FormData;
  const requestBody: BodyInit | undefined = init?.body === undefined
    ? undefined
    : multipart ? init.body as FormData : JSON.stringify(init.body);
  const response = await sessionFetch(`${API_URL}${path}`, {
    method: init?.method || 'GET',
    headers: multipart ? {} : { 'content-type': 'application/json' },
    body: requestBody,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messageSource = payload?.payload?.message ?? payload?.message;
    const message = Array.isArray(messageSource) ? messageSource.join(', ') : messageSource;
    throw new Error(typeof message === 'string' ? message : 'Request could not be completed');
  }
  return (payload?.payload ?? payload) as T;
}

export default function PortalPage() {
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void api<{ authenticated: boolean }>('/auth/session')
      .then(() => setToken('cookie-session'))
      .catch(() => setToken(''))
      .finally(() => setReady(true));
  }, []);

  const load = useCallback(async (activeToken = token) => {
    if (!activeToken) return;
    setLoading(true); setError('');
    try {
      const next = await api<Dashboard>('/portal/dashboard', activeToken);
      setDashboard(next);
      if (next.principal.accountType === 'CUSTOMER' && next.kycRequired && !next.kycComplete) {
        setTab('kyc');
      }
    } catch (requestError) {
      const message = (requestError as Error).message;
      if (/unauthorized|expired|401/i.test(message)) {
        setToken(''); setDashboard(null);
      } else setError(message);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (ready && token) void load(token); }, [ready, token, load]);

  const logout = () => {
    void api('/auth/logout', token, { method: 'POST' }).finally(() => {
      setToken(''); setDashboard(null); setTab('home');
    });
  };

  if (!ready) return <div className="splash"><div className="brand-mark"><Landmark /></div><span>FINIFY</span></div>;
  if (!token) return <Login onAuthenticated={() => setToken('cookie-session')} />;
  if (!dashboard) return <div className="splash"><LoaderCircle className="spin" /><span>{error || 'SECURING YOUR ACCOUNT'}</span><button onClick={() => void load()}>TRY AGAIN</button></div>;

  const navigation: Array<[Tab, string, React.ReactNode]> = [
    ['home', 'Home', <Home key="home" />], ['wallets', 'Wallets', <WalletCards key="wallets" />],
    ...(dashboard.principal.accountType === 'CUSTOMER' && !dashboard.kycComplete
      ? [['kyc', 'Verify', <Fingerprint key="kyc" />] as [Tab, string, React.ReactNode]]
      : [['pay', 'Pay', <Send key="pay" />] as [Tab, string, React.ReactNode]]),
    ['activity', 'Activity', <History key="activity" />],
    ['profile', 'Profile', <CircleUserRound key="profile" />],
  ];
  const choose = (next: Tab) => {
    setTab(next === 'pay' && !dashboard.kycComplete ? 'kyc' : next);
    setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="portal">
      <aside className={menuOpen ? 'side-nav open' : 'side-nav'}>
        <div className="brand"><span className="brand-mark"><Landmark /></span><div><strong>FINIFY</strong><small>MONEY IN MOTION</small></div><button className="mobile-only" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X /></button></div>
        <div className="identity"><span>{initials(dashboard.principal.displayName)}</span><div><strong>{dashboard.principal.displayName}</strong><small>{dashboard.principal.accountType === 'BUSINESS' ? dashboard.principal.businessType || 'Business account' : 'Personal account'}</small></div></div>
        <nav>{navigation.map(([id, label, icon]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => choose(id)}>{icon}<span>{label}</span>{id === 'pay' && <i>NEW</i>}</button>)}</nav>
        <div className="side-foot"><button onClick={logout}><LogOut /> Sign out</button><small>Protected by Finify Secure</small></div>
      </aside>
      {menuOpen && <button className="backdrop" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}

      <section className="workspace">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu /></button>
          <div><small>{dashboard.principal.accountType === 'BUSINESS' ? 'BUSINESS PORTAL' : 'PERSONAL PORTAL'}</small><strong>{titleFor(tab)}</strong></div>
          <div className="top-actions"><button onClick={() => void load()} aria-label="Refresh"><RefreshCw className={loading ? 'spin' : ''} /></button><span>{initials(dashboard.principal.displayName)}</span></div>
        </header>

        <div className="content">
          {error && <div className="notice error"><ShieldCheck />{error}<button onClick={() => setError('')}><X /></button></div>}
          {tab === 'home' && <HomeView data={dashboard} onNavigate={choose} />}
          {tab === 'wallets' && <WalletsView wallets={dashboard.wallets} />}
          {tab === 'pay' && <PaymentView token={token} data={dashboard} onDone={() => void load()} />}
          {tab === 'activity' && <ActivityView token={token} wallets={dashboard.wallets} initial={dashboard.recentActivity} />}
          {tab === 'kyc' && <KycView token={token} data={dashboard} onRefresh={() => void load()} />}
          {tab === 'profile' && <ProfileView token={token} data={dashboard} logout={logout} />}
        </div>
      </section>

      <nav className="bottom-nav">{navigation.map(([id, label, icon]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => choose(id)}>{icon}<span>{label}</span></button>)}</nav>
    </main>
  );
}

function Login({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [showPin, setShowPin] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<{ authenticated: boolean }>('/auth/login', undefined, { method: 'POST', body: { username, password } });
      if (!result.authenticated) throw new Error('Authentication session was not created');
      onAuthenticated();
    } catch (requestError) { setError((requestError as Error).message); } finally { setBusy(false); }
  };
  return <main className="login-shell">
    <section className="login-story"><div className="brand light"><span className="brand-mark"><Landmark /></span><div><strong>FINIFY</strong><small>MONEY IN MOTION</small></div></div><div className="story-copy"><span className="secure-chip"><i /> SECURE PERSONAL + BUSINESS BANKING</span><h1>Your money.<br /><em>Moving forward.</em></h1><p>One clear view of every wallet, payment and decision—designed to move as quickly as you do.</p></div><div className="story-proof"><span><ShieldCheck /> Protected access</span><span><Smartphone /> Built for every screen</span></div></section>
    <section className="login-panel"><div className="mobile-brand"><span className="brand-mark"><Landmark /></span><strong>FINIFY</strong></div><form onSubmit={submit}><span className="login-icon"><Fingerprint /></span><small>WELCOME BACK</small><h2>Access your account</h2><p>Personal and business users sign in with their registered mobile number and secure PIN.</p>{error && <div className="login-error">{error}</div>}<label><span>MOBILE NUMBER</span><div><Smartphone /><input inputMode="numeric" autoComplete="username" placeholder="e.g. 447700900123" value={username} onChange={(event) => setUsername(event.target.value.replace(/\D/g, ''))} /></div></label><label><span>SECURE PIN</span><div><LockKeyhole /><input type={showPin ? 'text' : 'password'} inputMode="numeric" autoComplete="current-password" placeholder="Enter your PIN" value={password} onChange={(event) => setPassword(event.target.value.replace(/\D/g, ''))} /><button type="button" onClick={() => setShowPin(!showPin)} aria-label={showPin ? 'Hide PIN' : 'Show PIN'}>{showPin ? <EyeOff /> : <Eye />}</button></div></label><button className="primary" disabled={busy || !username || !password}>{busy ? <LoaderCircle className="spin" /> : <LockKeyhole />} SIGN IN SECURELY <ArrowRight /></button><div className="login-help"><span><ShieldCheck /> Encrypted session</span></div></form></section>
  </main>;
}

function HomeView({ data, onNavigate }: { data: Dashboard; onNavigate: (tab: Tab) => void }) {
  const primary = data.wallets.find((wallet) => wallet.isDefault) || data.wallets[0];
  const business = data.principal.accountType === 'BUSINESS';
  return <>
    {!business && data.kycRequired && !data.kycComplete && <section className="kyc-callout"><span><Fingerprint /></span><div><small>IDENTITY VERIFICATION REQUIRED</small><h2>Complete KYC to activate financial transactions.</h2><p>Your wallet remains protected while we verify your identity document, live selfie and sanctions screening.</p></div><button onClick={() => onNavigate('kyc')}>CONTINUE KYC <ArrowRight /></button></section>}
    <div className="welcome"><div><small>{greeting().toUpperCase()}</small><h1>{firstName(data.principal.displayName)}, your money is ready.</h1><p>{business ? 'Track settlements, accept payments and manage your business cash flow.' : 'Move money, manage currencies and stay on top of every transaction.'}</p></div><StatusBadge principal={data.principal} kyc={data.kyc} /></div>
    <div className="home-grid"><section className="balance-card"><div className="balance-head"><span><Landmark /> {primary?.walletName || 'Primary wallet'}</span><small>{primary?.currency || '—'} ·•• {primary?.walletId.slice(-4)}</small></div><p>AVAILABLE BALANCE</p><h2>{money(primary?.balance || 0, primary?.currency || 'GBP')}</h2><div className="balance-actions"><button onClick={() => onNavigate('pay')}><span><Send /></span>Send</button><button onClick={() => onNavigate('wallets')}><span><WalletCards /></span>Wallets</button><button onClick={() => onNavigate('activity')}><span><ReceiptText /></span>Statements</button></div><div className="card-glow" /></section>
      <section className="quick-panel"><div className="section-head"><div><small>QUICK ACTIONS</small><h3>What would you like to do?</h3></div></div><div className="quick-grid"><button onClick={() => onNavigate(data.kycComplete ? 'pay' : 'kyc')}><span>{data.kycComplete ? <ArrowUpRight /> : <Fingerprint />}</span><div><strong>{data.kycComplete ? 'Send money' : 'Complete KYC'}</strong><small>{data.kycComplete ? 'To any Finify wallet' : 'Required before financial transactions'}</small></div><ChevronRight /></button><button onClick={() => onNavigate('wallets')}><span><WalletCards /></span><div><strong>Manage wallets</strong><small>{data.wallets.length} active account{data.wallets.length === 1 ? '' : 's'}</small></div><ChevronRight /></button><button onClick={() => onNavigate('activity')}><span><History /></span><div><strong>View activity</strong><small>Search every movement</small></div><ChevronRight /></button><button onClick={() => onNavigate(data.kycComplete ? 'profile' : 'kyc')}><span>{business ? <Building2 /> : <ShieldCheck />}</span><div><strong>{business ? 'Business profile' : 'Identity status'}</strong><small>{business ? data.principal.businessType || 'Verified business' : data.kyc?.status || 'KYC not started'}</small></div><ChevronRight /></button></div></section></div>
    <section className="activity-panel"><div className="section-head"><div><small>RECENT ACTIVITY</small><h3>Latest movements</h3></div><button onClick={() => onNavigate('activity')}>VIEW ALL <ArrowRight /></button></div><ActivityList rows={data.recentActivity} empty="Your latest payments will appear here." /></section>
  </>;
}

function WalletsView({ wallets }: { wallets: Wallet[] }) {
  const [selected, setSelected] = useState(wallets[0]?.walletId || '');
  const current = wallets.find((wallet) => wallet.walletId === selected) || wallets[0];
  return <><div className="page-intro"><div><small>MULTI-CURRENCY MONEY</small><h1>Your wallets</h1><p>Every currency and account in one secure place.</p></div></div><div className="wallet-layout"><div className="wallet-stack">{wallets.map((wallet, index) => <button key={wallet.walletId} className={`wallet-tile ${selected === wallet.walletId ? 'selected' : ''}`} onClick={() => setSelected(wallet.walletId)}><div><span>{wallet.isDefault ? 'PRIMARY' : `WALLET ${String(index + 1).padStart(2, '0')}`}</span><small>{wallet.walletName || 'Finify wallet'}</small></div><h2>{money(wallet.balance, wallet.currency)}</h2><footer><span>{wallet.currency}</span><small>•••• {wallet.walletId.slice(-4)}</small></footer></button>)}</div>{current && <section className="wallet-detail"><div className="section-head"><div><small>ACCOUNT DETAILS</small><h3>{current.walletName || 'Wallet'} · {current.currency}</h3></div><span className="status live"><i /> ACTIVE</span></div><dl><div><dt>Wallet ID</dt><dd>{current.walletId}</dd></div><div><dt>Internal account</dt><dd>{current.accountCode || '—'}</dd></div><div><dt>IBAN</dt><dd>{current.iban || 'Not assigned'}</dd></div><div><dt>SWIFT / BIC</dt><dd>{current.swiftBic || 'Not assigned'}</dd></div><div><dt>Commission balance</dt><dd>{money(current.commissionBalance || 0, current.currency)}</dd></div><div><dt>Default wallet</dt><dd>{current.isDefault ? 'Yes' : 'No'}</dd></div></dl></section>}</div></>;
}

function PaymentView({ token, data, onDone }: { token: string; data: Dashboard; onDone: () => void }) {
  const [form, setForm] = useState({ sourceWalletId: data.wallets[0]?.walletId || '', destinationWalletId: '', amount: '', keyword: data.services[0]?.keyword || 'PMNT', referenceId: '', pin: '' });
  const [recipient, setRecipient] = useState<{ displayName: string; currency: string } | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const source = data.wallets.find((wallet) => wallet.walletId === form.sourceWalletId);
  const validateRecipient = async () => {
    if (!form.destinationWalletId) return setRecipient(null);
    try { setRecipient(await api<{ displayName: string; currency: string }>(`/portal/recipients/${form.destinationWalletId}`, token)); setMessage(null); }
    catch (error) { setRecipient(null); setMessage({ tone: 'error', text: (error as Error).message }); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const result: any = await api('/portal/payments', token, { method: 'POST', body: { ...form, amount: Number(form.amount), currency: source?.currency } });
      if (Number(result?.Responsecode ?? result?.ResponseCode ?? 200) >= 400) throw new Error(result?.ResponseDescription || 'Payment was not completed');
      setMessage({ tone: 'success', text: `Payment sent successfully${result?.TransactionId ? ` · ${result.TransactionId}` : ''}.` });
      setForm((current) => ({ ...current, destinationWalletId: '', amount: '', referenceId: '', pin: '' })); setRecipient(null); onDone();
    } catch (error) { setMessage({ tone: 'error', text: (error as Error).message }); } finally { setBusy(false); }
  };
  return <div className="pay-layout"><section className="pay-copy"><small>MOVE MONEY</small><h1>Send with confidence.</h1><p>Recipient details are verified before your payment is submitted. Charges and commission are calculated by Finify automatically.</p><div><ShieldCheck /><span><strong>Protected end to end</strong><small>Your PIN authorises this payment only.</small></span></div></section><form className="payment-form" onSubmit={submit}><div className="form-head"><span><Send /></span><div><small>NEW PAYMENT</small><h2>Payment details</h2></div></div>{message && <div className={`notice ${message.tone}`}>{message.tone === 'success' ? <Check /> : <ShieldCheck />}{message.text}</div>}<label><span>PAY FROM</span><select value={form.sourceWalletId} onChange={(event) => setForm({ ...form, sourceWalletId: event.target.value })}>{data.wallets.map((wallet) => <option key={wallet.walletId} value={wallet.walletId}>{wallet.currency} · {wallet.walletName} · {money(wallet.balance, wallet.currency)}</option>)}</select></label><label><span>RECIPIENT WALLET ID</span><div className="input-action"><input inputMode="numeric" value={form.destinationWalletId} onChange={(event) => { setForm({ ...form, destinationWalletId: event.target.value.replace(/\D/g, '') }); setRecipient(null); }} onBlur={() => void validateRecipient()} placeholder="Enter recipient wallet" /><button type="button" onClick={() => void validateRecipient()}>VERIFY</button></div></label>{recipient && <div className="recipient"><span>{initials(recipient.displayName)}</span><div><strong>{recipient.displayName}</strong><small>Verified recipient · {recipient.currency}</small></div><Check /></div>}<div className="form-row"><label><span>AMOUNT</span><div className="money-input"><b>{source?.currency}</b><input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value.replace(/[^\d.]/g, '') })} placeholder="0.00" /></div></label><label><span>SERVICE</span><select value={form.keyword} onChange={(event) => setForm({ ...form, keyword: event.target.value })}>{data.services.map((service) => <option key={service.keyword} value={service.keyword}>{service.description || service.keyword}</option>)}</select></label></div><label><span>REFERENCE (OPTIONAL)</span><input value={form.referenceId} onChange={(event) => setForm({ ...form, referenceId: event.target.value })} placeholder="Invoice, order or personal note" /></label><label><span>AUTHORISE WITH PIN</span><input type="password" inputMode="numeric" value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value.replace(/\D/g, '') })} placeholder="Your secure PIN" /></label><button className="primary" disabled={busy || !recipient || !form.amount || !form.pin}>{busy ? <LoaderCircle className="spin" /> : <Send />} REVIEW & SEND <ArrowRight /></button></form></div>;
}

function ActivityView({ token, wallets, initial }: { token: string; wallets: Wallet[]; initial: Activity[] }) {
  const [rows, setRows] = useState(initial); const [wallet, setWallet] = useState(''); const [loading, setLoading] = useState(false);
  const load = async (walletId = wallet) => { setLoading(true); try { const result = await api<{ data: Activity[] }>(`/portal/activity?limit=100${walletId ? `&walletId=${walletId}` : ''}`, token); setRows(result.data); } finally { setLoading(false); } };
  return <><div className="page-intro"><div><small>LEDGER ACTIVITY</small><h1>Every movement, clearly.</h1><p>Credits, debits and balances directly from your Finify ledger.</p></div><select value={wallet} onChange={(event) => { setWallet(event.target.value); void load(event.target.value); }}><option value="">All wallets</option>{wallets.map((item) => <option key={item.walletId} value={item.walletId}>{item.currency} ·•• {item.walletId.slice(-4)}</option>)}</select></div><section className="activity-panel full"><div className="section-head"><div><small>TRANSACTION HISTORY</small><h3>{loading ? 'Refreshing activity…' : `${rows.length} ledger entries`}</h3></div><button onClick={() => void load()}><RefreshCw className={loading ? 'spin' : ''} /> REFRESH</button></div><ActivityList rows={rows} empty="No ledger movements match this wallet." /></section></>;
}

function ProfileView({ token, data, logout }: { token: string; data: Dashboard; logout: () => void }) {
  const [pins, setPins] = useState({ currentPin: '', newPin: '' }); const [message, setMessage] = useState('');
  const changePin = async () => { setMessage(''); try { await api('/portal/security/pin', token, { method: 'PATCH', body: pins }); setPins({ currentPin: '', newPin: '' }); setMessage('PIN updated successfully.'); } catch (error) { setMessage((error as Error).message); } };
  return <><div className="page-intro"><div><small>ACCOUNT + SECURITY</small><h1>Your profile</h1><p>Identity, access and account preferences in one place.</p></div></div><div className="profile-layout"><section className="profile-card"><div className="profile-avatar">{initials(data.principal.displayName)}</div><h2>{data.principal.displayName}</h2><span>{data.principal.accountType === 'BUSINESS' ? <BriefcaseBusiness /> : <CircleUserRound />}{data.principal.accountType === 'BUSINESS' ? 'Business account' : 'Personal account'}</span><dl><div><dt>Mobile number</dt><dd>{data.principal.ownerMsisdn}</dd></div><div><dt>Email</dt><dd>{data.principal.email || 'Not provided'}</dd></div><div><dt>Account state</dt><dd>Active</dd></div><div><dt>{data.principal.accountType === 'BUSINESS' ? 'Business type' : 'KYC status'}</dt><dd>{data.principal.accountType === 'BUSINESS' ? data.principal.businessType || 'Business' : data.kyc?.status || 'Not started'}</dd></div></dl></section><section className="security-card"><div className="section-head"><div><small>SECURITY</small><h3>Change secure PIN</h3></div><ShieldCheck /></div><p>Use 4–8 digits. Never share your PIN with anyone, including Finify support.</p>{message && <div className="notice success">{message}</div>}<label><span>CURRENT PIN</span><input type="password" inputMode="numeric" value={pins.currentPin} onChange={(event) => setPins({ ...pins, currentPin: event.target.value.replace(/\D/g, '') })} /></label><label><span>NEW PIN</span><input type="password" inputMode="numeric" value={pins.newPin} onChange={(event) => setPins({ ...pins, newPin: event.target.value.replace(/\D/g, '') })} /></label><button className="primary" disabled={!pins.currentPin || pins.newPin.length < 4} onClick={() => void changePin()}><LockKeyhole /> UPDATE PIN</button><button className="signout" onClick={logout}><LogOut /> SIGN OUT OF FINIFY</button></section></div></>;
}

function KycView({ token, data, onRefresh }: { token: string; data: Dashboard; onRefresh: () => void }) {
  const [journey, setJourney] = useState<KycJourney | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setJourney(await api<KycJourney>('/portal/kyc', token)); }
    catch (next) { setError((next as Error).message); }
    finally { setBusy(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const upload = async (role: string, file?: File) => {
    if (!file) return;
    const form = new FormData(); form.set('role', role); form.set('file', file);
    setBusy(true); setError(''); setMessage('');
    try {
      await api('/portal/kyc/documents', token, { method: 'POST', body: form });
      setMessage(`${role.replaceAll('_', ' ')} uploaded securely.`); await load();
    } catch (next) { setError((next as Error).message); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await api<KycJourney>('/portal/kyc/verify', token, { method: 'POST', body: {} });
      setJourney(next); setMessage('Verification completed and sent for independent review.'); onRefresh();
    } catch (next) { setError((next as Error).message); }
    finally { setBusy(false); }
  };
  const kycCase = journey?.case;
  const roles = new Set(kycCase?.documents.map((document) => document.role) || []);
  const identityRole = kycCase?.documentType === 'PASSPORT' ? 'PASSPORT' : 'ID_FRONT';
  const editable = ['DRAFT', 'RESUBMISSION_REQUIRED'].includes(kycCase?.status || '');
  const readyToVerify = roles.has(identityRole) && roles.has('SELFIE');
  return <div className="kyc-journey">
    <div className="page-intro"><div><small>SECURE IDENTITY</small><h1>Verify who you are.</h1><p>Complete these protected checks once to activate payments and KYC-required wallet services.</p></div><StatusBadge principal={data.principal} kyc={data.kyc} /></div>
    {error && <div className="notice"><ShieldCheck />{error}</div>}{message && <div className="notice success"><Check />{message}</div>}
    <section className="kyc-progress"><div className={roles.has(identityRole) ? 'done' : 'active'}><span>{roles.has(identityRole) ? <Check /> : '1'}</span><strong>Identity document</strong><small>{roles.has(identityRole) ? 'Uploaded' : 'Required'}</small></div><i /><div className={roles.has('SELFIE') ? 'done' : roles.has(identityRole) ? 'active' : ''}><span>{roles.has('SELFIE') ? <Check /> : '2'}</span><strong>Live selfie</strong><small>{roles.has('SELFIE') ? 'Captured' : 'Required'}</small></div><i /><div className={kycCase?.status === 'APPROVED' ? 'done' : ['MANUAL_REVIEW', 'PROCESSING'].includes(kycCase?.status || '') ? 'active' : ''}><span>{kycCase?.status === 'APPROVED' ? <Check /> : '3'}</span><strong>Secure review</strong><small>{kycCase?.status?.replaceAll('_', ' ') || 'Pending'}</small></div></section>
    {busy && !journey ? <div className="empty"><LoaderCircle className="spin" /><strong>Loading your secure KYC case</strong></div> : !kycCase ? <section className="kyc-state"><ShieldCheck /><h2>KYC case unavailable</h2><p>Please contact support so a protected identity case can be linked to your account.</p></section> : editable ? <div className="kyc-upload-grid">
      <label className={roles.has(identityRole) ? 'complete' : ''}><span>{roles.has(identityRole) ? <FileCheck2 /> : <UploadCloud />}</span><div><small>STEP 01</small><h2>{kycCase.documentType === 'PASSPORT' ? 'Passport photo page' : 'National ID front'}</h2><p>Use a clear image with all corners visible and no glare.</p></div><input type="file" accept="image/jpeg,image/png" capture="environment" disabled={busy} onChange={(event) => void upload(identityRole, event.target.files?.[0])} /><b>{roles.has(identityRole) ? 'REPLACE IMAGE' : 'TAKE OR UPLOAD PHOTO'}</b></label>
      {kycCase.documentType !== 'PASSPORT' && <label className={roles.has('ID_BACK') ? 'complete optional' : 'optional'}><span>{roles.has('ID_BACK') ? <FileCheck2 /> : <UploadCloud />}</span><div><small>OPTIONAL</small><h2>National ID back</h2><p>Add the reverse side when it contains identity information.</p></div><input type="file" accept="image/jpeg,image/png" capture="environment" disabled={busy} onChange={(event) => void upload('ID_BACK', event.target.files?.[0])} /><b>{roles.has('ID_BACK') ? 'REPLACE IMAGE' : 'ADD BACK IMAGE'}</b></label>}
      <label className={roles.has('SELFIE') ? 'complete selfie' : 'selfie'}><span>{roles.has('SELFIE') ? <Check /> : <Camera />}</span><div><small>STEP 02</small><h2>Live selfie</h2><p>Face the camera directly in good light. Remove sunglasses and hats.</p></div><input type="file" accept="image/jpeg,image/png" capture="user" disabled={busy} onChange={(event) => void upload('SELFIE', event.target.files?.[0])} /><b>{roles.has('SELFIE') ? 'RETAKE SELFIE' : 'OPEN CAMERA'}</b></label>
      <section className="kyc-submit"><div><ScanFace /><span><strong>Encrypted verification</strong><small>OCR, face comparison and sanctions screening run together.</small></span></div><button className="primary" disabled={busy || !readyToVerify} onClick={() => void verify()}>{busy ? <LoaderCircle className="spin" /> : <Fingerprint />} SUBMIT FOR VERIFICATION <ArrowRight /></button></section>
    </div> : <section className={`kyc-state ${kycCase.status === 'APPROVED' ? 'approved' : ''}`}><span>{kycCase.status === 'APPROVED' ? <Check /> : <LoaderCircle className={kycCase.status === 'PROCESSING' ? 'spin' : ''} />}</span><small>CASE {kycCase.id.slice(0, 8).toUpperCase()}</small><h2>{kycCase.status === 'APPROVED' ? 'Identity verified' : kycCase.status === 'MANUAL_REVIEW' ? 'Verification under review' : kycCase.status.replaceAll('_', ' ')}</h2><p>{kycCase.status === 'APPROVED' ? 'Your KYC-required financial services are active.' : 'Your evidence has been received. An independent checker must approve it before payments are enabled.'}</p>{kycCase.faceMatchScore !== null && kycCase.faceMatchScore !== undefined && <div><span>FACE MATCH</span><strong>{Number(kycCase.faceMatchScore).toFixed(1)}%</strong></div>}<button className="outline" onClick={() => void load()}><RefreshCw /> REFRESH STATUS</button></section>}
  </div>;
}

function ActivityList({ rows, empty }: { rows: Activity[]; empty: string }) {
  if (!rows.length) return <div className="empty"><ReceiptText /><strong>No activity yet</strong><span>{empty}</span></div>;
  return <div className="activity-list">{rows.map((row) => { const outgoing = Number(row.debit || 0) > 0; const amount = outgoing ? row.debit : row.credit; return <div key={row.id}><span className={outgoing ? 'movement out' : 'movement in'}>{outgoing ? <ArrowUpRight /> : <ArrowDownLeft />}</span><div><strong>{row.keyword || (outgoing ? 'Money sent' : 'Money received')}</strong><small>{formatDate(row.createdAt)} · {row.reference || `Transaction ${row.transactionId || row.id}`}</small></div><b className={outgoing ? 'negative' : 'positive'}>{outgoing ? '−' : '+'}{money(amount, row.currency)}</b></div>; })}</div>;
}

function StatusBadge({ principal, kyc }: { principal: Principal; kyc?: Dashboard['kyc'] }) { const text = principal.accountType === 'BUSINESS' ? 'BUSINESS ACTIVE' : kyc?.status === 'APPROVED' ? 'IDENTITY VERIFIED' : `KYC ${kyc?.status || 'NOT STARTED'}`; return <span className={`status ${text.includes('VERIFIED') || text.includes('ACTIVE') ? 'live' : ''}`}><i />{text}</span>; }
function titleFor(tab: Tab) { return ({ home: 'Overview', wallets: 'Wallets', pay: 'Send money', activity: 'Activity', kyc: 'Identity verification', profile: 'Profile & security' } as const)[tab]; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'FI'; }
function firstName(value: string) { return value.trim().split(/\s+/)[0] || 'there'; }
function greeting() { const hour = new Date().getHours(); return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'; }
function money(value: number | string, currency: string) { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP', maximumFractionDigits: 2 }).format(Number(value || 0)); }
function formatDate(value?: string) { if (!value) return 'Just now'; return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
