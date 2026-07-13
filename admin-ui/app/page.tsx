'use client';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Server,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/finify';

type SetupStatus = {
  state: 'checking' | 'ready' | 'configured' | 'offline';
  tokenRequired: boolean;
};

type FormData = {
  displayName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  setupToken: string;
};

const steps = [
  { number: '01', label: 'Welcome' },
  { number: '02', label: 'System check' },
  { number: '03', label: 'Administrator' },
  { number: '04', label: 'Ready' },
];

const initialForm: FormData = {
  displayName: '', username: '', email: '', password: '', confirmPassword: '', setupToken: '',
};

export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<SetupStatus>({ state: 'checking', tokenRequired: false });
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const checkStatus = async () => {
    setStatus({ state: 'checking', tokenRequired: false });
    try {
      const response = await fetch(`${API_URL}/admin/auth/setup/status`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setStatus({
        state: data.needsSetup ? 'ready' : 'configured',
        tokenRequired: Boolean(data.setupTokenRequired),
      });
    } catch {
      setStatus({ state: 'offline', tokenRequired: false });
    }
  };

  useEffect(() => { void checkStatus(); }, []);

  const passwordChecks = useMemo(() => [
    { label: '12+ characters', valid: form.password.length >= 12 },
    { label: 'Upper & lowercase', valid: /[a-z]/.test(form.password) && /[A-Z]/.test(form.password) },
    { label: 'Number or symbol', valid: /[0-9\W]/.test(form.password) },
  ], [form.password]);

  const adminFormValid = Boolean(
    form.displayName.trim() &&
    /^[a-zA-Z0-9._-]+$/.test(form.username) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
    passwordChecks.every((item) => item.valid) &&
    form.password === form.confirmPassword &&
    (!status.tokenRequired || form.setupToken)
  );

  const update = (field: keyof FormData, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  };

  const initializeAdmin = async (event: FormEvent) => {
    event.preventDefault();
    if (!adminFormValid) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/admin/auth/setup/initialize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
          setupToken: form.setupToken || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Setup could not be completed.');
      sessionStorage.setItem('finify_access_token', data.accessToken);
      setStep(3);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Setup could not be completed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="setup-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <aside className="brand-panel">
        <div className="brand-mark" aria-label="Finify Control">
          <span className="brand-symbol"><span /></span>
          <span>finify<span className="brand-dot">.</span></span>
        </div>

        <div className="brand-message">
          <div className="eyebrow"><Sparkles size={14} /> Secure operations, beautifully simple</div>
          <h1>Build trust into<br />every transaction.</h1>
          <p>Set up your private control centre for wallets, customers, risk, and financial operations.</p>
        </div>

        <div className="trust-row">
          <ShieldCheck size={20} />
          <div><strong>Protected by design</strong><span>Role-based access · Encrypted sessions</span></div>
        </div>
        <div className="corner-grid" aria-hidden="true" />
      </aside>

      <section className="setup-panel">
        <header className="setup-header">
          <span>Initial setup</span>
          <span className="secure-label"><LockKeyhole size={14} /> Private & secure</span>
        </header>

        <nav className="stepper" aria-label="Setup progress">
          {steps.map((item, index) => (
            <div className={`step ${index === step ? 'active' : ''} ${index < step ? 'complete' : ''}`} key={item.number}>
              <span className="step-number">{index < step ? <Check size={14} /> : item.number}</span>
              <span className="step-label">{item.label}</span>
              {index < steps.length - 1 && <span className="step-line" />}
            </div>
          ))}
        </nav>

        <div className="stage-wrap">
          {step === 0 && (
            <div className="stage enter">
              <div className="stage-icon"><KeyRound /></div>
              <p className="kicker">ONE-TIME CONFIGURATION</p>
              <h2>Let’s prepare your<br />Finify workspace.</h2>
              <p className="lead">This guided setup creates the first administrator. It disappears permanently once configuration is complete.</p>
              <div className="info-card">
                <ShieldCheck />
                <div><strong>You’re creating the owner account</strong><span>This user can manage access, permissions, and all operational settings.</span></div>
              </div>
              <button className="primary-button" onClick={() => setStep(1)}>
                Begin setup <ArrowRight size={18} />
              </button>
              <p className="microcopy">Takes about 2 minutes</p>
            </div>
          )}

          {step === 1 && (
            <div className="stage enter">
              <div className="stage-icon"><Server /></div>
              <p className="kicker">SYSTEM CHECK</p>
              <h2>Everything in<br />the right place.</h2>
              <p className="lead">We’ll verify that the Admin API and secure database tables are ready before creating your account.</p>
              <div className="check-list">
                <CheckRow icon={<Server />} label="Admin API" detail={API_URL} state={status.state === 'offline' ? 'error' : status.state === 'checking' ? 'loading' : 'ok'} />
                <CheckRow icon={<Database />} label="Authentication database" detail={status.state === 'configured' ? 'Already configured' : 'Ready for first administrator'} state={status.state === 'offline' ? 'idle' : status.state === 'checking' ? 'loading' : 'ok'} />
                <CheckRow icon={<ShieldCheck />} label="Security policy" detail={status.tokenRequired ? 'Setup token required' : 'One-time setup lock enabled'} state={status.state === 'checking' ? 'loading' : 'ok'} />
              </div>
              {status.state === 'configured' && <div className="notice">Setup has already been completed. Sign in with your administrator account.</div>}
              {status.state === 'offline' && <div className="notice error-notice">We couldn’t reach the Admin API. Start the backend and try again.</div>}
              <div className="action-row">
                <button className="text-button" onClick={() => setStep(0)}><ArrowLeft size={17} /> Back</button>
                {status.state === 'offline' ? (
                  <button className="primary-button compact" onClick={checkStatus}>Try again</button>
                ) : (
                  <button className="primary-button compact" disabled={status.state !== 'ready'} onClick={() => setStep(2)}>Continue <ArrowRight size={17} /></button>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <form className="stage enter form-stage" onSubmit={initializeAdmin}>
              <p className="kicker">ADMINISTRATOR</p>
              <h2>Create your owner account.</h2>
              <p className="lead compact-lead">Use a work email and a unique password you don’t use anywhere else.</p>
              <div className="field-grid">
                <Field label="Full name" value={form.displayName} placeholder="e.g. Alex Morgan" onChange={(v) => update('displayName', v)} icon={<UserRound />} />
                <Field label="Username" value={form.username} placeholder="alex.morgan" onChange={(v) => update('username', v)} prefix="@" />
              </div>
              <Field label="Work email" type="email" value={form.email} placeholder="alex@company.com" onChange={(v) => update('email', v)} />
              <div className="field">
                <label htmlFor="password">Password</label>
                <div className="input-wrap">
                  <LockKeyhole size={17} />
                  <input id="password" value={form.password} onChange={(e) => update('password', e.target.value)} type={showPassword ? 'text' : 'password'} placeholder="Create a strong password" autoComplete="new-password" />
                  <button type="button" className="reveal" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</button>
                </div>
                <div className="password-checks">{passwordChecks.map((item) => <span className={item.valid ? 'valid' : ''} key={item.label}><Check size={12} /> {item.label}</span>)}</div>
              </div>
              <Field label="Confirm password" type="password" value={form.confirmPassword} placeholder="Repeat your password" onChange={(v) => update('confirmPassword', v)} error={Boolean(form.confirmPassword && form.password !== form.confirmPassword) ? 'Passwords do not match' : ''} />
              {status.tokenRequired && <Field label="One-time setup token" type="password" value={form.setupToken} placeholder="Enter the token from your environment" onChange={(v) => update('setupToken', v)} />}
              {error && <div className="notice error-notice">{error}</div>}
              <div className="action-row form-actions">
                <button className="text-button" type="button" onClick={() => setStep(1)}><ArrowLeft size={17} /> Back</button>
                <button className="primary-button compact" disabled={!adminFormValid || submitting} type="submit">
                  {submitting ? <LoaderCircle className="spin" size={17} /> : <>Create administrator <ArrowRight size={17} /></>}
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="stage complete-stage enter">
              <div className="success-orbit"><CheckCircle2 /></div>
              <p className="kicker">SETUP COMPLETE</p>
              <h2>Your control centre<br />is ready.</h2>
              <p className="lead">Welcome, {form.displayName.split(' ')[0] || 'Administrator'}. Your secure workspace has been created and the setup route is now locked.</p>
              <div className="profile-chip"><span>{initials(form.displayName)}</span><div><strong>{form.displayName}</strong><small>Super administrator · {form.email}</small></div></div>
              <button className="primary-button">Enter Finify Control <ChevronRight size={18} /></button>
            </div>
          )}
        </div>

        <footer className="setup-footer"><span>Finify Control</span><span>© 2026 · Secure financial operations</span></footer>
      </section>
    </main>
  );
}

function CheckRow({ icon, label, detail, state }: { icon: React.ReactNode; label: string; detail: string; state: 'loading' | 'ok' | 'error' | 'idle' }) {
  return <div className="check-row"><span className="check-icon">{icon}</span><div><strong>{label}</strong><small>{detail}</small></div><span className={`check-state ${state}`}>{state === 'loading' ? <LoaderCircle className="spin" /> : state === 'ok' ? <CheckCircle2 /> : state === 'error' ? '!' : '—'}</span></div>;
}

function Field({ label, value, placeholder, onChange, type = 'text', icon, prefix, error }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; type?: string; icon?: React.ReactNode; prefix?: string; error?: string }) {
  const id = label.toLowerCase().replace(/ /g, '-');
  return <div className="field"><label htmlFor={id}>{label}</label><div className={`input-wrap ${error ? 'input-error' : ''}`}>{icon}{prefix && <span className="prefix">{prefix}</span>}<input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" /></div>{error && <small className="field-error">{error}</small>}</div>;
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'AD';
}
