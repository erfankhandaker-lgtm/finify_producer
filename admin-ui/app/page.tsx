'use client';

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Command,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  FileClock,
  Fingerprint,
  Gauge,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Network,
  PanelLeftClose,
  Plus,
  ReceiptText,
  Search,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  UserCog,
  Users,
  WalletCards,
  Workflow,
  X,
  Zap,
  ChevronLeft,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import Image from 'next/image';
import PricingFlowWorkspace from '../features/pricing-flow/PricingFlowWorkspace';
import type { PricingAdminRequest } from '../features/pricing-flow/PricingFlowWorkspace';
import type { PricingFlowRecord } from '../features/pricing-flow/model';
import AccessControlWorkspace from '../features/access-control/AccessControlWorkspace';
import AmlConfigurationBuilder from '../features/aml/AmlConfigurationBuilder';
import type {
  AmlAdminRequest,
  AmlConfiguration,
} from '../features/aml/AmlConfigurationBuilder';
import ReferenceDataWorkspace from '../features/reference-data/ReferenceDataWorkspace';
import type { ReferenceDataRequest } from '../features/reference-data/ReferenceDataWorkspace';
import KycWorkspace from '../features/kyc/KycWorkspace';
import OnboardingJourneyWorkspace from '../features/onboarding-journey/OnboardingJourneyWorkspace';
import type { OnboardingAdminRequest } from '../features/onboarding-journey/OnboardingJourneyWorkspace';
import OnboardingChannelWorkspace from '../features/onboarding-channel/OnboardingChannelWorkspace';
import type { ChannelAdminRequest } from '../features/onboarding-channel/OnboardingChannelWorkspace';
import CreditCommercialWorkspace from '../features/credit-commercial/CreditCommercialWorkspace';
import type { CreditCommercialRequest } from '../features/credit-commercial/CreditCommercialWorkspace';
import { sessionFetch } from '../lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/finify';
const DEFAULT_TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

type SetupStatus = {
  state: 'checking' | 'ready' | 'configured' | 'offline';
  tokenRequired: boolean;
};

type AdminProfile = {
  id?: string;
  username?: string;
  displayName?: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
};

type MrFinifyAction = {
  type: 'navigate';
  moduleId: string;
  label: string;
};

type MrFinifyMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: MrFinifyAction[];
  toolsUsed?: string[];
  error?: boolean;
};

type MrFinifyStatus = {
  configured: boolean;
  state: 'READY' | 'CONFIGURATION_REQUIRED';
  accessScope: 'SUPERADMIN' | 'ROLE_SCOPED';
  model?: string | null;
  toolCount: number;
  tools: string[];
  message: string;
  writeToolsEnabled: boolean;
};

type WalletRow = {
  walletId: string;
  accountCode?: string;
  ownerMsisdn: string;
  ownerType: string;
  purpose: string;
  walletCode: number;
  walletName?: string;
  balance: number | string;
  currency: string;
  status: number;
  isDefault: boolean;
  iban?: string;
  swiftBic?: string;
};

type ServiceHealth = {
  id: string;
  label: string;
  detail: string;
  category: 'APPLICATION' | 'DEPENDENCY';
  state: 'operational' | 'checking' | 'degraded';
  latency?: number;
  message?: string;
};

type SystemPulse = {
  status: 'operational' | 'degraded';
  checkedAt: string;
  refreshAfterSeconds: number;
  summary: {
    total: number;
    operational: number;
    degraded: number;
  };
  services: ServiceHealth[];
};

type PulseDomain = {
  id: string;
  label: string;
  detail: string;
  services: ServiceHealth[];
};

type WalletBalanceGroup = {
  currency: string;
  balance: number | string;
  walletCount: number;
};

type SystemWalletRow = {
  walletId: string;
  walletCode: number;
  walletName: string;
  purpose: string;
  balance: number | string;
  currency: string;
  status: number;
};

type CommandCenterMetrics = {
  checkedAt: string;
  customerWallets: { total: number; active: number; balances: WalletBalanceGroup[] };
  merchantWallets: { balances: WalletBalanceGroup[] };
  systemWallets: SystemWalletRow[];
  scoredProfiles: { total: number; scoreRecords: number; linkedBy: 'MSISDN' };
  creditPolicies: { total: number; active: number };
  pendingReviews: { total: number; referenceData: number; pricingFlows: number; treasuryFunding: number; kyc: number };
};

type TreasuryFundingClassification =
  | 'OWNER_INVESTMENT'
  | 'CUSTOMER_FUNDS'
  | 'BANK_PREFUNDING';

type TreasuryFundingRequest = {
  id: string;
  fundingType: 'SAFEGUARDING' | 'COMMISSION_FUNDING' | 'CHARGE_REVENUE';
  direction: 'CREDIT' | 'DEBIT';
  businessPurpose: 'SAFEGUARDING_FUNDING' | 'COMMISSION_FUNDING' | 'SAFEGUARDING_WITHDRAWAL' | 'GROSS_PROFIT_WITHDRAWAL';
  fundingClassification: TreasuryFundingClassification | 'NOT_APPLICABLE';
  walletId: string;
  walletCode: number;
  walletName: string;
  currency: string;
  amount: number | string;
  reference: string;
  bankName: string;
  bankAccount: string;
  valueDate: string;
  evidenceReference: string;
  evidenceDocumentId?: string;
  evidenceDocumentName?: string;
  evidenceDocumentType?: string;
  evidenceDocumentSize?: string;
  status: string;
  maker: string;
  makerComment: string;
  createdAt?: unknown;
};

type CustomerRow = {
  customerId: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  address?: string;
  idType?: string;
  idNumber?: string;
  gender?: string;
  dob?: string;
  kycCaseId?: string;
  kycVerifiedAt?: string;
  kycVerifiedBy?: string;
  kycRequired?: boolean;
  kycDataConnected?: boolean;
  status: number;
  kycStatus?: number;
  creditScore?: number;
  category?: string;
  creditLimit?: number;
  availableLimit?: number;
  currentDpd?: number;
  walletCount: number;
  walletBalance: number | string;
  walletBalances?: WalletBalanceGroup[];
};

type CustomerKycCase = {
  id: string;
  status: string;
  documentType?: string;
  issuingCountry?: string;
  systemRecommendation?: string;
  faceMatchScore?: number | string;
  amlMatch?: boolean;
  extractedData?: Record<string, unknown>;
  screeningSummary?: Record<string, unknown>;
  finalReason?: string;
  createdBy?: string;
  reviewedBy?: string;
  createdAt?: string;
  reviewedAt?: string;
  documentCount?: number;
  documentRoles?: string[];
};

type CustomerDecisionRow = {
  id: string;
  applicationId?: string;
  productId?: string;
  outcome?: string;
  finalLimit?: number | string;
  reasonCode?: string;
  createdAt?: unknown;
};

type CustomerDetail = {
  profile: CustomerRow;
  wallets: WalletRow[];
  decisions: CustomerDecisionRow[];
  accountOpening?: {
    id: string;
    status: 'PENDING_KYC' | 'READY_TO_OPEN' | 'KYC_REJECTED' | 'OPENED' | 'CANCELLED';
    walletCode: number;
    walletName?: string;
    currency: string;
    kycRequired: boolean;
    kycCaseId?: string;
    walletId?: string;
  } | null;
  latestKycCase?: CustomerKycCase | null;
  kycCases: CustomerKycCase[];
};

type CustomerWalletType = {
  walletCode: number;
  walletName: string;
  walletDetails?: string;
  kycRequired: boolean;
};

type TransactionRow = {
  transactionId: string;
  transactionCode?: string;
  keyword?: string;
  sourceWalletId: string;
  destinationWalletId: string;
  amount: number | string;
  currency: string;
  fee?: number | string;
  commission?: number | string;
  statusCode: number;
  status: string;
  reference?: string;
  remarks?: string;
  transactionDate?: unknown;
  journalStatus?: string;
  journalMode?: string;
  amlStatus?: string;
};

type TransactionDetail = {
  transaction: TransactionRow & {
    feePayer?: string;
    commissionReceiver?: string;
    destinationName?: string;
    createdAt?: unknown;
  };
  details: Array<Record<string, unknown>>;
  journals: Array<Record<string, unknown>>;
  entries: Array<Record<string, unknown>>;
  aml: Record<string, unknown> | null;
  disputes: Array<Record<string, unknown>>;
  refund: Record<string, unknown> | null;
};

type CreditMaster = {
  id: string;
  ruleCode: string;
  version: number;
  name: string;
  customerCategory: string;
  productId: string;
  currency?: string;
  maximumLimit: number | string;
  status: string;
  createdBy?: string;
};

type SetupForm = {
  displayName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  setupToken: string;
};

const initialSetupForm: SetupForm = {
  displayName: '',
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  setupToken: '',
};

const navigation = [
  {
    label: 'OPERATIONS',
    items: [
      { id: 'command', label: 'Command center', icon: LayoutDashboard },
      { id: 'pulse', label: 'System pulse', icon: Activity },
      { id: 'customers', label: 'Customer management', icon: Users },
      { id: 'onboarding', label: 'Onboarding journeys', icon: Workflow, required: ['onboarding_journeys.read'] },
      { id: 'onboarding-channels', label: 'Onboarding channels', icon: Network, required: ['onboarding_channels.read'] },
      { id: 'transactions', label: 'Transactions', icon: ReceiptText },
      { id: 'kyc', label: 'KYC & identity', icon: Fingerprint, required: ['kyc.read'] },
    ],
  },
  {
    label: 'CREDIT',
    items: [
      { id: 'credit', label: 'Decision engine', icon: Workflow, signal: true },
      { id: 'loans', label: 'Lending commercial', icon: CircleDollarSign, required: ['credit_commercial.read'] },
      { id: 'collections', label: 'EMI & collections', icon: Clock3 },
      { id: 'funders', label: 'Funders & banks', icon: Landmark },
    ],
  },
  {
    label: 'CONTROL',
    items: [
      { id: 'risk', label: 'Risk & AML', icon: ShieldAlert },
      {
        id: 'charges',
        label: 'Charge & commission',
        icon: ReceiptText,
        required: ['pricing_rules.read'],
      },
      { id: 'accounting', label: 'Accounting', icon: BookOpen },
      { id: 'approvals', label: 'Approval center', icon: FileClock },
      { id: 'access', label: 'User management', icon: UserCog, required: ['admin_users.read', 'admin_roles.read'] },
      { id: 'configuration', label: 'Configuration', icon: SlidersHorizontal, required: ['reference_data.read'] },
    ],
  },
];

function canSeeNavigationItem(
  item: { id: string; required?: readonly string[] },
  profile: AdminProfile,
) {
  return (
    !item.required ||
    profile.roles?.includes('super_admin') === true ||
    item.required.every((permission) => profile.permissions?.includes(permission))
  );
}

async function fetchSetupStatus(): Promise<SetupStatus> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await sessionFetch(`${API_URL}/admin/auth/setup/status`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error();
    const raw = await response.json();
    const data = raw.payload || raw;
    return {
      state: data.needsSetup ? 'ready' : 'configured',
      tokenRequired: Boolean(data.setupTokenRequired),
    };
  } catch {
    return { state: 'offline', tokenRequired: false };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function unwrap<T>(raw: unknown): T {
  const candidate = raw as { payload?: T };
  return candidate?.payload ?? (raw as T);
}

async function authenticatedFetch<T>(route: string, token: string): Promise<T> {
  void token;
  const response = await sessionFetch(`${API_URL}${route}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(String(response.status));
  return unwrap<T>(await response.json());
}

async function adminRequest<T>(
  route: string,
  token: string,
  init: { method?: string; body?: unknown; headers?: Record<string,string> } = {},
): Promise<T> {
  void token;
  const response = await sessionFetch(`${API_URL}${route}`, {
    method: init.method || 'GET',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init.headers || {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = raw?.message || raw?.error || raw?.payload?.message || `Request failed (${response.status})`;
    throw new Error(Array.isArray(message) ? message.join(', ') : String(message));
  }
  return unwrap<T>(raw);
}

export default function AdminPortal() {
  const [setupStatus, setSetupStatus] = useState<SetupStatus>({
    state: 'checking',
    tokenRequired: false,
  });
  const [screen, setScreen] = useState<'boot' | 'setup' | 'login' | 'portal'>('boot');
  const [token, setToken] = useState('');

  const resolveEntry = useCallback(async () => {
    const status = await fetchSetupStatus();
    setSetupStatus(status);
    if (status.state === 'ready') {
      setScreen('setup');
      return;
    }
    if (status.state === 'configured') {
      const session = await sessionFetch(`${API_URL}/admin/auth/me`, { cache: 'no-store' });
      if (session.ok) {
        setToken('cookie-session');
        setScreen('portal');
        return;
      }
    }
    setScreen('login');
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void resolveEntry(), 0);
    return () => window.clearTimeout(timer);
  }, [resolveEntry]);

  const acceptSession = () => {
    setToken('cookie-session');
    setScreen('portal');
  };

  if (screen === 'boot') return <BootScreen />;
  if (screen === 'setup') {
    return <SetupExperience status={setupStatus} onComplete={acceptSession} onStatus={resolveEntry} />;
  }
  if (screen === 'login') {
    return <LoginExperience status={setupStatus} onLogin={acceptSession} onRetry={resolveEntry} />;
  }
  return (
    <CommandCenter
      token={token}
      onExpired={() => {
        setToken('');
        setScreen('login');
      }}
    />
  );
}

function BootScreen() {
  return (
    <main className="boot-screen">
      <div className="matrix-grid" />
      <Brand />
      <div className="boot-core">
        <span className="boot-orbit"><Fingerprint /></span>
        <p>ESTABLISHING SECURE CHANNEL</p>
        <span className="boot-line"><i /></span>
      </div>
      <small>FINIFY COMMAND / OBSIDIAN INTERFACE</small>
    </main>
  );
}

function LoginExperience({
  status,
  onLogin,
  onRetry,
}: {
  status: SetupStatus;
  onLogin: (token: string, refreshToken?: string) => void;
  onRetry: () => Promise<void>;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'password' | 'totp' | 'enroll' | 'recover' | 'recovery-pin'>('password');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [recoveryPin, setRecoveryPin] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [pendingSession, setPendingSession] = useState<{ accessToken: string; refreshToken?: string } | null>(null);
  const [captchaSettings, setCaptchaSettings] = useState({ enabled: true, siteKey: DEFAULT_TURNSTILE_SITE_KEY });

  useEffect(() => {
    void sessionFetch(`${API_URL}/admin/auth/security/bootstrap`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((raw) => {
        const data = unwrap<{ captchaEnabled?: boolean; turnstileSiteKey?: string }>(raw);
        setCaptchaSettings({
          enabled: data.captchaEnabled !== false,
          siteKey: data.turnstileSiteKey || DEFAULT_TURNSTILE_SITE_KEY,
        });
      })
      .catch(() => undefined);
  }, []);

  const startEnrollment = async (id: string) => {
    const response = await sessionFetch(`${API_URL}/admin/auth/mfa/enrollment/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: id }),
    });
    const data = unwrap<{ qrCodeDataUrl?: string; manualKey?: string; message?: string }>(await response.json());
    if (!response.ok || !data.qrCodeDataUrl || !data.manualKey) throw new Error(data.message || 'Authenticator setup could not be started.');
    setQrCode(data.qrCodeDataUrl);
    setManualKey(data.manualKey);
    setStep('enroll');
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password || (captchaSettings.enabled && !captchaToken)) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await sessionFetch(`${API_URL}/admin/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, ...(captchaSettings.enabled ? { captchaToken } : {}) }),
      });
      const data = unwrap<{ challengeId?: string; enrollmentRequired?: boolean; message?: string }>(
        await response.json(),
      );
      if (!response.ok || !data.challengeId) {
        throw new Error(data.message || 'Authentication was not accepted.');
      }
      setChallengeId(data.challengeId);
      if (data.enrollmentRequired) await startEnrollment(data.challengeId);
      else setStep('totp');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Authentication was not accepted.',
      );
    } finally {
      setSubmitting(false);
      setCaptchaToken('');
      setCaptchaKey((value) => value + 1);
    }
  };

  const submitMfa = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setSubmitting(true);
    setError('');
    try {
      const route = step === 'enroll' ? 'mfa/enrollment/confirm' : 'mfa/verify';
      const response = await sessionFetch(`${API_URL}/admin/auth/${route}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId, code }),
      });
      const data = unwrap<{ authenticated?: boolean; recoveryPin?: string; message?: string }>(await response.json());
      if (!response.ok || !data.authenticated) throw new Error(data.message || 'Authenticator verification was not accepted.');
      if (data.recoveryPin) {
        setRecoveryPin(data.recoveryPin);
        setPendingSession({ accessToken: 'cookie-session' });
        setStep('recovery-pin');
      } else onLogin('cookie-session');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Authenticator verification was not accepted.');
    } finally {
      setSubmitting(false);
    }
  };

  const recover = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError('');
    try {
      const response = await sessionFetch(`${API_URL}/admin/auth/mfa/recover`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId, recoveryPin }),
      });
      const data = unwrap<{ message?: string }>(await response.json());
      if (!response.ok) throw new Error(data.message || 'Recovery PIN was not accepted.');
      setRecoveryPin('');
      await startEnrollment(challengeId);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Recovery failed.'); }
    finally { setSubmitting(false); }
  };

  const heading = step === 'password' ? 'Enter the command layer.' : step === 'recovery-pin' ? 'Save your recovery PIN.' : step === 'recover' ? 'Recover your authenticator.' : step === 'enroll' ? 'Activate your authenticator.' : 'Confirm it is you.';

  return (
    <main className="access-shell">
      <div className="matrix-grid" />
      <div className="scan-line" />
      <section className="access-brand">
        <Brand />
        <div className="access-message">
          <span className="signal-chip"><span /> SYSTEM ACCESS / RESTRICTED</span>
          <h1>Financial control.<br /><em>Absolute clarity.</em></h1>
          <p>
            One secure command surface for money movement, credit intelligence,
            risk, and institutional operations.
          </p>
        </div>
        <div className="access-telemetry">
          <Telemetry label="ENCRYPTION" value="AES-256" />
          <Telemetry label="POLICY" value="ZERO TRUST" />
          <Telemetry label="REGION" value="LONDON / 01" />
        </div>
      </section>

      <section className="access-form-panel">
        <div className="access-form-top">
          <span>FINIFY COMMAND</span>
          <span className={`connection-state ${status.state === 'offline' ? 'offline' : ''}`}>
            <i /> {status.state === 'offline' ? 'API OFFLINE' : 'SECURE LINK'}
          </span>
        </div>
        <form className="login-card" onSubmit={step === 'password' ? login : step === 'recover' ? recover : submitMfa}>
          <div className="login-icon">{step === 'password' ? <Fingerprint /> : <ShieldCheck />}</div>
          <p className="mono-kicker">IDENTITY VERIFICATION</p>
          <h2>{heading}</h2>
          <p className="form-intro">{step === 'password' ? 'Password, bot protection, and authenticator verification are required.' : step === 'recover' ? 'Enter the one-time PIN issued when MFA was activated.' : step === 'recovery-pin' ? 'This PIN is displayed once. Store it separately from your phone.' : step === 'enroll' ? 'Scan the QR code in Microsoft Authenticator, Google Authenticator, Authy, or 1Password.' : 'Enter the current six-digit code from your authenticator app.'}</p>

          {step === 'password' && <>
            <DarkField label="Administrator ID" value={username} placeholder="username" onChange={setUsername} icon={<Users />} autoComplete="username" />
            <DarkField
              label="Security credential"
              value={password}
              placeholder="Enter password"
              onChange={setPassword}
              icon={<LockKeyhole />}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              action={
                <button
                  type="button"
                  className="field-action"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              }
            />
            {captchaSettings.enabled && <TurnstileChallenge key={`${captchaKey}-${captchaSettings.siteKey}`} siteKey={captchaSettings.siteKey} onVerify={setCaptchaToken} />}
          </>}
          {step === 'enroll' && <div className="mfa-enrollment"><Image src={qrCode} width={180} height={180} unoptimized alt="Authenticator QR code" /><span>MANUAL SETUP KEY</span><code>{manualKey}</code></div>}
          {(step === 'enroll' || step === 'totp') && <DarkField label="Authenticator code" value={code} placeholder="000000" onChange={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} icon={<ShieldCheck />} autoComplete="one-time-code" />}
          {step === 'recover' && <DarkField label="Recovery PIN" value={recoveryPin} placeholder="0000-0000-0000" onChange={setRecoveryPin} icon={<KeyRound />} autoComplete="off" />}
          {step === 'recovery-pin' && <div className="recovery-pin-card"><span>ONE-TIME RECOVERY PIN</span><strong>{recoveryPin}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(recoveryPin)}>COPY PIN</button><p>Using it will require you to scan a new authenticator QR code. The old PIN will immediately become invalid.</p></div>}
          {error && <div className="access-error"><AlertTriangle /> {error}</div>}
          {status.state === 'offline' && (
            <button className="link-button" type="button" onClick={() => void onRetry()}>
              Re-establish API connection
            </button>
          )}
          {step === 'recovery-pin' ? <button className="command-button" type="button" onClick={() => pendingSession && onLogin(pendingSession.accessToken, pendingSession.refreshToken)}><ShieldCheck /> I HAVE STORED THE PIN <ArrowRight /></button> : <button className="command-button" type="submit" disabled={submitting || status.state === 'offline' || (step === 'password' ? !username.trim() || !password || (captchaSettings.enabled && !captchaToken) : step === 'recover' ? recoveryPin.replace(/\D/g, '').length !== 12 : !/^\d{6}$/.test(code))}>{submitting ? <LoaderCircle className="spin" /> : <KeyRound />}{submitting ? 'VERIFYING IDENTITY' : step === 'enroll' ? 'ACTIVATE MFA' : step === 'recover' ? 'RECOVER & RE-ENROL' : 'AUTHORIZE SESSION'}{!submitting && <ArrowRight />}</button>}
          {step === 'totp' && <button className="link-button" type="button" onClick={() => { setRecoveryPin(''); setStep('recover'); setError(''); }}>Lost your authenticator? Use recovery PIN</button>}
          {step === 'recover' && <button className="link-button" type="button" onClick={() => { setStep('totp'); setError(''); }}>Return to authenticator code</button>}
          <div className="security-footnote">
            <ShieldCheck />
            <span>Session activity is encrypted, monitored, and written to the security ledger.</span>
          </div>
        </form>
        <footer className="access-footer">
          <span>OBSIDIAN UI v1.0</span><span>AUTHORIZED PERSONNEL ONLY</span>
        </footer>
      </section>
    </main>
  );
}

function TurnstileChallenge({ siteKey, onVerify }: { siteKey: string; onVerify: (token: string) => void }) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widgetId: string | undefined;
    type TurnstileApi = { render: (target: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
    const turnstileApi = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;
    const render = () => {
      const turnstile = turnstileApi();
      if (!turnstile || !target.current) return;
      widgetId = turnstile.render(target.current, {
        sitekey: siteKey,
        theme: 'dark', callback: onVerify, 'expired-callback': () => onVerify(''), 'error-callback': () => onVerify(''),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-finify-turnstile]');
    if (existing) { if (turnstileApi()) render(); else existing.addEventListener('load', render, { once: true }); }
    else {
      const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; script.defer = true; script.dataset.finifyTurnstile = 'true'; script.addEventListener('load', render, { once: true }); document.head.appendChild(script);
    }
    return () => { const turnstile = turnstileApi(); if (widgetId && turnstile) turnstile.remove(widgetId); };
  }, [onVerify, siteKey]);
  return <div className="turnstile-frame"><div ref={target} /></div>;
}

function SetupExperience({
  status,
  onComplete,
  onStatus,
}: {
  status: SetupStatus;
  onComplete: (token: string, refreshToken?: string) => void;
  onStatus: () => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialSetupForm);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const passwordChecks = useMemo(
    () => [
      { label: '12+ characters', valid: form.password.length >= 12 },
      {
        label: 'Mixed case',
        valid: /[a-z]/.test(form.password) && /[A-Z]/.test(form.password),
      },
      { label: 'Number / symbol', valid: /[0-9\W]/.test(form.password) },
    ],
    [form.password],
  );
  const valid = Boolean(
    form.displayName.trim() &&
      /^[a-zA-Z0-9._-]+$/.test(form.username) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
      passwordChecks.every((item) => item.valid) &&
      form.password === form.confirmPassword &&
      (!status.tokenRequired || form.setupToken),
  );
  const update = (field: keyof SetupForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  };
  const initialize = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    try {
      const response = await sessionFetch(`${API_URL}/admin/auth/setup/initialize`, {
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
      const data = unwrap<{ authenticated?: boolean; message?: string }>(
        await response.json(),
      );
      if (!response.ok || !data.authenticated) {
        throw new Error(data.message || 'Setup could not be completed.');
      }
      setStep(3);
      window.setTimeout(() => onComplete('cookie-session'), 900);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Setup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const steps = ['Initialize', 'System check', 'Administrator', 'Ready'];
  return (
    <main className="setup-shell obsidian-setup">
      <div className="matrix-grid" />
      <aside className="setup-brand-panel">
        <Brand />
        <div className="setup-brand-copy">
          <span className="signal-chip"><span /> ROOT CONFIGURATION</span>
          <h1>Establish your<br /><em>command authority.</em></h1>
          <p>Create the first protected identity for Finify’s financial operating system.</p>
        </div>
        <div className="setup-security-list">
          <span><ShieldCheck /> Maker-checker governance</span>
          <span><Fingerprint /> Identity-bound audit trail</span>
          <span><LockKeyhole /> Encrypted session control</span>
        </div>
      </aside>
      <section className="setup-workspace">
        <div className="setup-progress">
          {steps.map((label, index) => (
            <div
              className={`setup-progress-item ${index === step ? 'active' : ''} ${index < step ? 'complete' : ''}`}
              key={label}
            >
              <span>{index < step ? <Check /> : `0${index + 1}`}</span>
              <small>{label}</small>
            </div>
          ))}
        </div>

        <div className="setup-stage">
          {step === 0 && (
            <SetupStage
              icon={<KeyRound />}
              kicker="ONE-TIME INITIALIZATION"
              title={<>Prepare the<br />Obsidian command layer.</>}
              copy="This protected sequence creates the first administrator and permanently seals public setup access."
            >
              <div className="obsidian-info">
                <ShieldCheck />
                <div><strong>Root administrator</strong><span>Full authority over roles, approvals, policy, and operational access.</span></div>
              </div>
              <button className="command-button setup-command" onClick={() => setStep(1)}>
                BEGIN INITIALIZATION <ArrowRight />
              </button>
            </SetupStage>
          )}
          {step === 1 && (
            <SetupStage
              icon={<Database />}
              kicker="SYSTEM INTEGRITY"
              title={<>Verify the<br />control plane.</>}
              copy="The command layer must confirm its security and data dependencies before creating authority."
            >
              <div className="integrity-list">
                <IntegrityRow icon={<Network />} label="Admin API" detail={API_URL} state={status.state === 'offline' ? 'error' : 'ok'} />
                <IntegrityRow icon={<Database />} label="Identity store" detail="Encrypted administrator records" state={status.state === 'offline' ? 'idle' : 'ok'} />
                <IntegrityRow icon={<ShieldCheck />} label="Setup policy" detail={status.tokenRequired ? 'Protected by setup token' : 'One-time lock enabled'} state="ok" />
              </div>
              {status.state === 'offline' && <div className="access-error"><AlertTriangle /> Control API unavailable.</div>}
              <div className="setup-actions">
                <button className="ghost-command" onClick={() => setStep(0)}><ArrowLeft /> BACK</button>
                {status.state === 'offline' ? (
                  <button className="command-button small" onClick={() => void onStatus()}>RETRY LINK</button>
                ) : (
                  <button className="command-button small" onClick={() => setStep(2)}>CONTINUE <ArrowRight /></button>
                )}
              </div>
            </SetupStage>
          )}
          {step === 2 && (
            <form className="setup-form-stage" onSubmit={initialize}>
              <p className="mono-kicker">ADMINISTRATOR IDENTITY</p>
              <h2>Create root authority.</h2>
              <p className="form-intro">Use an individual work identity. All actions will be attributed to this account.</p>
              <div className="setup-field-grid">
                <DarkField label="Full name" value={form.displayName} placeholder="Alex Morgan" onChange={(value) => update('displayName', value)} icon={<Users />} />
                <DarkField label="Username" value={form.username} placeholder="alex.morgan" onChange={(value) => update('username', value)} icon={<Fingerprint />} />
              </div>
              <DarkField label="Work email" type="email" value={form.email} placeholder="alex@company.com" onChange={(value) => update('email', value)} icon={<Network />} />
              <DarkField
                label="Security credential"
                value={form.password}
                placeholder="Create a strong password"
                onChange={(value) => update('password', value)}
                icon={<LockKeyhole />}
                type={showPassword ? 'text' : 'password'}
                action={<button type="button" className="field-action" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</button>}
              />
              <div className="credential-checks">
                {passwordChecks.map((item) => <span className={item.valid ? 'valid' : ''} key={item.label}><Check /> {item.label}</span>)}
              </div>
              <DarkField label="Confirm credential" type="password" value={form.confirmPassword} placeholder="Repeat password" onChange={(value) => update('confirmPassword', value)} icon={<ShieldCheck />} />
              {status.tokenRequired && <DarkField label="Setup token" type="password" value={form.setupToken} placeholder="One-time environment token" onChange={(value) => update('setupToken', value)} icon={<KeyRound />} />}
              {error && <div className="access-error"><AlertTriangle /> {error}</div>}
              <div className="setup-actions">
                <button className="ghost-command" type="button" onClick={() => setStep(1)}><ArrowLeft /> BACK</button>
                <button className="command-button small" disabled={!valid || submitting}>
                  {submitting ? <LoaderCircle className="spin" /> : <Fingerprint />}
                  {submitting ? 'CREATING AUTHORITY' : 'CREATE AUTHORITY'}
                </button>
              </div>
            </form>
          )}
          {step === 3 && (
            <SetupStage
              icon={<CheckCircle2 />}
              kicker="AUTHORITY ESTABLISHED"
              title={<>The command layer<br />is operational.</>}
              copy={`Welcome, ${form.displayName.split(' ')[0] || 'Administrator'}. Opening your secure workspace now.`}
            >
              <div className="success-terminal">
                <span><Check /> IDENTITY SEALED</span>
                <span><Check /> PERMISSIONS ASSIGNED</span>
                <span><Check /> AUDIT LEDGER ACTIVE</span>
              </div>
            </SetupStage>
          )}
        </div>
      </section>
    </main>
  );
}

function CommandCenter({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [active, setActive] = useState('command');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [profile, setProfile] = useState<AdminProfile>({});
  const [metrics, setMetrics] = useState<CommandCenterMetrics | null>(null);
  const [pulseRefreshing, setPulseRefreshing] = useState(false);
  const [pulseCheckedAt, setPulseCheckedAt] = useState('');
  const [pulseError, setPulseError] = useState('');
  const [services, setServices] = useState<ServiceHealth[]>([
    { id: 'producer', label: 'Producer API', detail: 'Core transaction and administration API', category: 'APPLICATION', state: 'checking' },
    { id: 'mr-finify', label: 'Mr. Finify', detail: 'Role-scoped intelligent financial operations assistant', category: 'APPLICATION', state: 'checking' },
    { id: 'admin-ui', label: 'Admin UI', detail: 'Command and control interface', category: 'APPLICATION', state: 'checking' },
    { id: 'portal-ui', label: 'Customer & business portal', detail: 'Responsive wallet and payment experience', category: 'APPLICATION', state: 'checking' },
    { id: 'consumer', label: 'Consumer service', detail: 'Transaction events and merchant integration', category: 'APPLICATION', state: 'checking' },
    { id: 'credit-rules', label: 'Credit rules', detail: 'Policy evaluation and credit decisions', category: 'APPLICATION', state: 'checking' },
    { id: 'accounting', label: 'Accounting service', detail: 'Ledger, EOD, and financial reporting', category: 'APPLICATION', state: 'checking' },
    { id: 'kyc', label: 'KYC service', detail: 'Identity cases, evidence, and review workflow', category: 'APPLICATION', state: 'checking' },
    { id: 'kyc-ocr', label: 'KYC OCR worker', detail: 'Document OCR and biometric face comparison', category: 'APPLICATION', state: 'checking' },
    { id: 'mock-merchant', label: 'Mock merchant', detail: 'Two-leg approval and rejection simulator', category: 'APPLICATION', state: 'checking' },
    { id: 'postgres', label: 'PostgreSQL', detail: 'Primary operational data store', category: 'DEPENDENCY', state: 'checking' },
    { id: 'redis', label: 'Redis', detail: 'Configuration cache and coordination', category: 'DEPENDENCY', state: 'checking' },
    { id: 'kafka', label: 'Kafka', detail: 'Transaction event streaming', category: 'DEPENDENCY', state: 'checking' },
    { id: 'minio', label: 'MinIO', detail: 'Private treasury document storage', category: 'DEPENDENCY', state: 'checking' },
  ]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setNotificationsOpen(false);
        setAssistantOpen(false);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);

  useEffect(() => {
    let activeRequest = true;
    void Promise.allSettled([
      authenticatedFetch<AdminProfile>('/admin/auth/me', token),
      authenticatedFetch<CommandCenterMetrics>(
        '/admin/operations/command-center',
        token,
      ),
    ]).then((results) => {
      if (!activeRequest) return;
      const [profileResult, metricsResult] = results;
      if (results.some(
        (result) =>
          result.status === 'rejected' &&
          (result.reason as Error).message === '401',
      )) {
        onExpired();
        return;
      }
      if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
      if (metricsResult.status === 'fulfilled') setMetrics(metricsResult.value);
    });
    return () => {
      activeRequest = false;
    };
  }, [onExpired, token]);

  const refreshSystemPulse = useCallback(async () => {
    setPulseRefreshing(true);
    try {
      const [pulse, liveMetrics] = await Promise.all([
        authenticatedFetch<SystemPulse>(
          '/admin/operations/system-pulse',
          token,
        ),
        authenticatedFetch<CommandCenterMetrics>(
          '/admin/operations/command-center',
          token,
        ),
      ]);
      setServices(pulse.services || []);
      setMetrics(liveMetrics);
      setPulseCheckedAt(pulse.checkedAt);
      setPulseError('');
    } catch (error) {
      if ((error as Error).message === '401') {
        onExpired();
        return;
      }
      setServices((current) =>
        current.map((service) => ({
          ...service,
          state: 'degraded',
          message: 'System Pulse API is unavailable',
        })),
      );
      setPulseError('System Pulse API is unavailable');
      setPulseCheckedAt(new Date().toISOString());
    } finally {
      setPulseRefreshing(false);
    }
  }, [onExpired, token]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshSystemPulse(), 0);
    const interval = window.setInterval(() => void refreshSystemPulse(), 15000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refreshSystemPulse]);

  const logout = async () => {
    try {
      await sessionFetch(`${API_URL}/admin/auth/logout`, {
        method: 'POST',
      });
    } finally {
      onExpired();
    }
  };

  const currentLabel =
    navigation.flatMap((group) => group.items).find((item) => item.id === active)?.label ||
    'Command center';

  return (
    <main className={`portal-shell ${sidebarCompact ? 'compact-sidebar' : ''}`}>
      <div className="portal-grid" />
      <aside className={`portal-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-head">
          <Brand compact={sidebarCompact} />
          <button className="icon-button compact-toggle" onClick={() => setSidebarCompact(!sidebarCompact)} aria-label="Toggle compact navigation"><PanelLeftClose /></button>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X /></button>
        </div>
        <div className="environment-chip"><i /> <span>DEVELOPMENT</span><small>FINIFY-2</small></div>
        <nav className="portal-nav">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.filter((item) => canSeeNavigationItem(item, profile)).map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    className={`nav-item ${active === item.id ? 'active' : ''}`}
                    key={item.id}
                    onClick={() => {
                      setActive(item.id);
                      setSidebarOpen(false);
                    }}
                    title={sidebarCompact ? item.label : undefined}
                  >
                    <Icon /><span>{item.label}</span>
                    {'signal' in item && item.signal && <i className="nav-signal" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-security">
          <div className="security-ring"><ShieldCheck /></div>
          <div><strong>Security posture</strong><span>All controls active</span></div>
          <i />
        </div>
        <div className="sidebar-user">
          <Avatar name={profile.displayName || profile.username || 'Administrator'} />
          <div><strong>{profile.displayName || profile.username || 'Administrator'}</strong><span>{profile.roles?.includes('super_admin') ? 'Super administrator' : profile.roles?.[0]?.replaceAll('_', ' ') || 'Administrator'}</span></div>
          <button className="icon-button" onClick={() => void logout()} aria-label="Log out"><LogOut /></button>
        </div>
      </aside>

      <section className="portal-main">
        <header className="portal-topbar">
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu /></button>
          <div className="breadcrumb"><span>FINIFY COMMAND</span><ChevronRight /><strong>{currentLabel}</strong></div>
          <div className="topbar-actions">
            <button className="command-search" onClick={() => setPaletteOpen(true)}>
              <Search /><span>Search or execute a command</span><kbd>⌘ K</kbd>
            </button>
            {(profile.roles?.includes('super_admin') || profile.permissions?.includes('assistant.use')) && <button className="mr-finify-launch" onClick={() => setAssistantOpen(true)}><Sparkles /><span>MR. FINIFY</span><i /></button>}
            <span className="utc-clock"><Clock3 /> UTC+1</span>
            <div className="notification-wrap">
              <button className="icon-button notification-button" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label="Notifications"><Bell /><i /></button>
              {notificationsOpen && <NotificationPanel />}
            </div>
            <Avatar name={profile.displayName || profile.username || 'Administrator'} small />
          </div>
        </header>

        <div className="portal-content">
          {active === 'command' ? (
            <Dashboard
              token={token}
              profile={profile}
              metrics={metrics}
              services={services}
              pulseRefreshing={pulseRefreshing}
              pulseCheckedAt={pulseCheckedAt}
              pulseError={pulseError}
              onRefreshPulse={() => void refreshSystemPulse()}
              openModule={setActive}
            />
          ) : active === 'pulse' ? (
            <SystemPulseWorkspace
              services={services}
              pulseRefreshing={pulseRefreshing}
              pulseCheckedAt={pulseCheckedAt}
              pulseError={pulseError}
              onRefresh={() => void refreshSystemPulse()}
            />
          ) : (
            <ModuleWorkspace
              moduleId={active}
              title={currentLabel}
              token={token}
              profile={profile}
              openCommand={() => setPaletteOpen(true)}
              onNavigate={setActive}
              onExpired={onExpired}
            />
          )}
        </div>
      </section>

      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}
      {paletteOpen && <CommandPalette profile={profile} onClose={() => setPaletteOpen(false)} onNavigate={(id) => { setActive(id); setPaletteOpen(false); }} />}
      {assistantOpen && <MrFinifyDrawer token={token} profile={profile} activeModule={active} onClose={() => setAssistantOpen(false)} onNavigate={(moduleId) => { setActive(moduleId); setSidebarOpen(false); }} />}
    </main>
  );
}

function MrFinifyDrawer({
  token,
  profile,
  activeModule,
  onClose,
  onNavigate,
}: {
  token: string;
  profile: AdminProfile;
  activeModule: string;
  onClose: () => void;
  onNavigate: (moduleId: string) => void;
}) {
  const [status, setStatus] = useState<MrFinifyStatus | null>(null);
  const [messages, setMessages] = useState<MrFinifyMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const firstName = (profile.displayName || profile.username || 'Administrator').split(' ')[0];
  const suggestions = activeModule === 'accounting'
    ? ['Show the latest EOD status', 'Check the general ledger balance', 'Open the Accounting workspace']
    : activeModule === 'customers'
      ? ['Show recent customers', 'Find a customer by MSISDN', 'Open Customer management']
      : activeModule === 'transactions'
        ? ['Show recent failed transactions', 'Check completed transactions', 'Open Transactions']
        : ['Give me the system overview', 'Show pending approvals', 'What can I do with my access?'];

  useEffect(() => {
    void adminRequest<MrFinifyStatus>('/admin/assistant/status', token)
      .then(setStatus)
      .catch((error) => setMessages([{ id: 'status-error', role: 'assistant', content: (error as Error).message, error: true }]));
    window.setTimeout(() => inputRef.current?.focus(), 80);
  }, [token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (value = input) => {
    const content = value.trim();
    if (!content || sending) return;
    const userMessage: MrFinifyMessage = { id: `user-${Date.now()}`, role: 'user', content };
    const history = messages.filter((message) => !message.error).slice(-10).map((message) => ({ role: message.role, content: message.content }));
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setSending(true);
    try {
      const result = await adminRequest<{
        configured: boolean;
        accessScope: 'SUPERADMIN' | 'ROLE_SCOPED';
        message: string;
        actions?: MrFinifyAction[];
        toolsUsed?: string[];
      }>('/admin/assistant/chat', token, {
        method: 'POST',
        body: { message: content, activeModule, history },
      });
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.message,
        actions: result.actions || [],
        toolsUsed: result.toolsUsed || [],
      }]);
      if (!result.configured) setStatus((current) => current ? { ...current, configured: false, state: 'CONFIGURATION_REQUIRED' } : current);
    } catch (error) {
      setMessages((current) => [...current, { id: `error-${Date.now()}`, role: 'assistant', content: (error as Error).message, error: true }]);
    } finally {
      setSending(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div className="mr-finify-layer" role="dialog" aria-modal="true" aria-label="Mr. Finify assistant">
      <button className="mr-finify-backdrop" onClick={onClose} aria-label="Close Mr. Finify" />
      <aside className="mr-finify-drawer">
        <header className="mr-finify-head">
          <div className="mr-finify-mark"><Sparkles /><i /></div>
          <div><span>FINIFY INTELLIGENCE</span><h2>Mr. Finify</h2><p>Your intelligent financial operations assistant</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close Mr. Finify"><X /></button>
        </header>
        <div className="mr-finify-security">
          <span className={status?.configured ? 'ready' : 'waiting'}><i />{status?.configured ? 'SECURE LINK ACTIVE' : 'CONFIGURATION REQUIRED'}</span>
          <strong><ShieldCheck /> {status?.accessScope === 'SUPERADMIN' ? 'PRIVILEGED COMMAND MODE' : 'ROLE-SCOPED ASSISTANCE'}</strong>
          <small>{status?.toolCount ?? 0} authorised tools · writes require protected UI workflows</small>
        </div>
        <div className="mr-finify-thread" ref={scrollRef}>
          {!messages.length && <div className="mr-finify-welcome">
            <div><Sparkles /></div>
            <span>GOOD {new Date().getHours() < 12 ? 'MORNING' : new Date().getHours() < 18 ? 'AFTERNOON' : 'EVENING'}, {firstName.toUpperCase()}</span>
            <h3>How can I assist?</h3>
            <p>I can inspect live Finify operations and guide you through the functions authorised for your account.</p>
            {!status?.configured && status && <div className="mr-finify-config-note"><AlertTriangle /><p>{status.message}</p></div>}
            <div className="mr-finify-suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => void send(suggestion)}><Command /><span>{suggestion}</span><ChevronRight /></button>)}</div>
          </div>}
          {messages.map((message) => <div className={`mr-finify-message ${message.role} ${message.error ? 'error' : ''}`} key={message.id}>
            <div className="mr-finify-message-author">{message.role === 'assistant' ? <><Sparkles /><span>MR. FINIFY</span></> : <><Avatar name={profile.displayName || profile.username || 'Administrator'} small /><span>YOU</span></>}</div>
            <p>{message.content}</p>
            {Boolean(message.toolsUsed?.length) && <small className="mr-finify-evidence"><Database /> VERIFIED WITH {message.toolsUsed?.map((tool) => tool.replaceAll('_', ' ')).join(' · ')}</small>}
            {Boolean(message.actions?.length) && <div className="mr-finify-actions">{message.actions?.map((action) => <button key={`${message.id}-${action.moduleId}`} onClick={() => onNavigate(action.moduleId)}><ArrowRight /> {action.label}</button>)}</div>}
          </div>)}
          {sending && <div className="mr-finify-message assistant thinking"><div className="mr-finify-message-author"><Sparkles /><span>MR. FINIFY</span></div><p><LoaderCircle className="spin" /> Inspecting authorised Finify controls…</p></div>}
        </div>
        <footer className="mr-finify-composer">
          <div className="mr-finify-context"><span><Activity /> CONTEXT: {activeModule.replaceAll('-', ' ').toUpperCase()}</span>{messages.length > 0 && <button onClick={() => setMessages([])}>CLEAR SESSION</button>}</div>
          <div className="mr-finify-input">
            <textarea ref={inputRef} rows={2} maxLength={4000} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask Mr. Finify about this workspace…" />
            <button disabled={!input.trim() || sending} onClick={() => void send()} aria-label="Send message">{sending ? <LoaderCircle className="spin" /> : <ArrowRight />}</button>
          </div>
          <p><LockKeyhole /> Responses operate within your authenticated permissions. Sensitive actions remain subject to confirmation and maker-checker control.</p>
        </footer>
      </aside>
    </div>
  );
}

function ThemedDatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  contextLabel = 'BUSINESS DATE',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  contextLabel?: string;
}) {
  const localIso = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  const selected = value
    ? new Date(`${value}T00:00:00`)
    : new Date();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(
    new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(month);
  const selectedLabel = value
    ? new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(selected)
    : placeholder;
  const mondayOffset = (month.getDay() + 6) % 7;
  const calendarStart = new Date(
    month.getFullYear(),
    month.getMonth(),
    1 - mondayOffset,
  );
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    const iso = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    return {
      date,
      iso,
      currentMonth: date.getMonth() === month.getMonth(),
      today: iso === localIso(new Date()),
    };
  });
  const choose = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };
  const openCalendar = () => {
    setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <div className="treasury-date-picker" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="treasury-date-trigger"
        onClick={() => open ? setOpen(false) : openCalendar()}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <CalendarDays />
        <span>{selectedLabel}</span>
        <ChevronRight />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="treasury-date-scrim"
            aria-label="Close calendar"
            onClick={() => setOpen(false)}
          />
          <div className="treasury-calendar" role="dialog" aria-label={`Choose ${contextLabel.toLowerCase()}`}>
            <div className="treasury-calendar-head">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                <ChevronLeft />
              </button>
              <strong>{monthLabel}</strong>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                <ChevronRight />
              </button>
            </div>
            <div className="treasury-calendar-weekdays">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                <span key={`${day}-${index}`}>{day}</span>
              ))}
            </div>
            <div className="treasury-calendar-grid">
              {days.map((day) => (
                <button
                  type="button"
                  key={day.iso}
                  className={[
                    day.currentMonth ? '' : 'outside',
                    day.today ? 'today' : '',
                    day.iso === value ? 'selected' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => choose(day.iso)}
                  aria-label={new Intl.DateTimeFormat('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }).format(day.date)}
                  aria-pressed={day.iso === value}
                >
                  {day.date.getDate()}
                </button>
              ))}
            </div>
            <div className="treasury-calendar-foot">
              <button
                type="button"
                onClick={() => choose(localIso(new Date()))}
              >
                TODAY
              </button>
              <span>{contextLabel}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Dashboard({
  token,
  profile,
  metrics,
  services,
  pulseRefreshing,
  pulseCheckedAt,
  pulseError,
  onRefreshPulse,
  openModule,
}: {
  token: string;
  profile: AdminProfile;
  metrics: CommandCenterMetrics | null;
  services: ServiceHealth[];
  pulseRefreshing: boolean;
  pulseCheckedAt: string;
  pulseError: string;
  onRefreshPulse: () => void;
  openModule: (id: string) => void;
}) {
  const operational = services.filter((service) => service.state === 'operational').length;
  const degraded = services.filter((service) => service.state === 'degraded').length;
  const checking = services.filter((service) => service.state === 'checking').length;
  const applicationServices = services.filter((service) => service.category === 'APPLICATION');
  const dependencyServices = services.filter((service) => service.category === 'DEPENDENCY');
  const pulseDomains = groupPulseServices(services);
  const attentionServices = services.filter((service) => service.state !== 'operational');
  const measuredLatencies = services
    .map((service) => service.latency)
    .filter((latency): latency is number => latency !== undefined);
  const averageLatency = measuredLatencies.length
    ? Math.round(measuredLatencies.reduce((sum, latency) => sum + latency, 0) / measuredLatencies.length)
    : null;
  const healthPercent = services.length ? Math.round((operational / services.length) * 100) : 0;
  const [pulseNow, setPulseNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setPulseNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const checkedAtMs = pulseCheckedAt ? new Date(pulseCheckedAt).getTime() : 0;
  const secondsSinceCheck = checkedAtMs ? Math.max(0, Math.floor((pulseNow - checkedAtMs) / 1000)) : 0;
  const nextScanSeconds = pulseRefreshing ? 0 : Math.max(0, 15 - secondsSinceCheck);
  const displayName = profile.displayName?.split(' ')[0] || profile.username || 'Operator';
  const [fundingOpen, setFundingOpen] = useState(false);
  const [fundingSubmitting, setFundingSubmitting] = useState(false);
  const [fundingMessage, setFundingMessage] = useState('');
  const [fundingFile, setFundingFile] = useState<File | null>(null);
  type TreasuryOperation =
    | 'ADD_SAFEGUARDING'
    | 'ADD_COMMISSION_FUNDING'
    | 'WITHDRAW_SAFEGUARDING'
    | 'WITHDRAW_CHARGE_REVENUE';
  const [fundingForm, setFundingForm] = useState({
    operation: 'ADD_SAFEGUARDING' as TreasuryOperation,
    fundingClassification: '' as TreasuryFundingClassification | 'NOT_APPLICABLE' | '',
    currency: 'GBP',
    amount: '',
    reference: '',
    bankName: '',
    bankAccount: '',
    valueDate: new Date().toISOString().slice(0, 10),
    comment: '',
  });
  const treasuryWalletCode = (operation: TreasuryOperation) => {
    if (operation === 'ADD_COMMISSION_FUNDING') return 114;
    if (operation === 'WITHDRAW_CHARGE_REVENUE') return 113;
    return 110;
  };
  const fundingCurrencies = (operation: TreasuryOperation) => [
    ...new Set(
      (metrics?.systemWallets || [])
        .filter((wallet) => wallet.walletCode === treasuryWalletCode(operation))
        .map((wallet) => wallet.currency),
    ),
  ];
  const openFunding = () => {
    const operation: TreasuryOperation = 'ADD_SAFEGUARDING';
    const currencies = fundingCurrencies(operation);
    setFundingForm({
      operation,
      fundingClassification: '',
      currency: currencies[0] || 'GBP',
      amount: '',
      reference: '',
      bankName: '',
      bankAccount: '',
      valueDate: new Date().toISOString().slice(0, 10),
      comment: '',
    });
    setFundingFile(null);
    setFundingMessage('');
    setFundingOpen(true);
  };
  const isSafeguardingMovement = fundingForm.operation === 'ADD_SAFEGUARDING'
    || fundingForm.operation === 'WITHDRAW_SAFEGUARDING';
  const fundingClassificationLabels: Record<TreasuryFundingClassification, string> = {
    OWNER_INVESTMENT: 'Owner investment / paid-in capital',
    CUSTOMER_FUNDS: 'Customer safeguarded funds',
    BANK_PREFUNDING: 'Bank or partner prefunding',
  };
  const selectedContraLabel = isSafeguardingMovement && fundingForm.fundingClassification
    && fundingForm.fundingClassification !== 'NOT_APPLICABLE'
    ? fundingClassificationLabels[fundingForm.fundingClassification]
    : '';
  const isSafeguardingDeposit = fundingForm.operation === 'ADD_SAFEGUARDING';
  const submitFunding = async () => {
    if (!fundingFile) {
      setFundingMessage('Upload the bank transaction document before submitting.');
      return;
    }
    setFundingSubmitting(true);
    let uploadedDocumentId = '';
    try {
      const uploadBody = new FormData();
      uploadBody.append('file', fundingFile);
      const uploadResponse = await sessionFetch(
        `${API_URL}/admin/operations/treasury-documents`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
          },
          body: uploadBody,
        },
      );
      const uploadRaw = await uploadResponse.json().catch(() => ({}));
      const upload = unwrap<{
        id: string;
        evidenceReference: string;
      }>(uploadRaw);
      if (!uploadResponse.ok || !upload.id) {
        const uploadMessage = uploadRaw?.message || uploadRaw?.payload?.message
          || `Document upload failed (${uploadResponse.status})`;
        throw new Error(Array.isArray(uploadMessage) ? uploadMessage.join(', ') : String(uploadMessage));
      }
      uploadedDocumentId = upload.id;
      await adminRequest('/admin/operations/treasury-funding-requests', token, {
        method: 'POST',
        body: {
          ...fundingForm,
          evidenceDocumentId: upload.id,
          evidenceReference: upload.evidenceReference,
        },
      });
      setFundingMessage('Treasury movement submitted. A different administrator must approve it in Approval Center.');
      setFundingOpen(false);
      onRefreshPulse();
    } catch (requestError) {
      if (uploadedDocumentId) {
        await adminRequest(
          `/admin/operations/treasury-documents/${uploadedDocumentId}`,
          token,
          { method: 'DELETE' },
        ).catch(() => undefined);
      }
      setFundingMessage((requestError as Error).message);
    } finally {
      setFundingSubmitting(false);
    }
  };
  return (
    <>
      <section className="command-hero">
        <div>
          <p className="mono-kicker">COMMAND CENTER / LIVE OPERATIONS</p>
          <h1>Good morning, {displayName}.</h1>
          <span>Financial infrastructure is monitored and ready for command.</span>
        </div>
        <div className="hero-status">
          <i className={operational === services.length ? '' : 'degraded'} /><div><strong>{operational === services.length ? 'ALL SYSTEMS NOMINAL' : `${operational}/${services.length} SYSTEMS ONLINE`}</strong><span>{pulseCheckedAt ? `Last scan ${formatDate(pulseCheckedAt)}` : 'Integrity scan starting'}</span></div>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard
          icon={<WalletCards />}
          label="Customer wallets"
          value={metrics ? formatInteger(metrics.customerWallets.total) : '—'}
          change={metrics ? `${formatInteger(metrics.customerWallets.active)} active` : 'Live registry'}
          tone="emerald"
        />
        <MetricCard
          icon={<Gauge />}
          label="Scored profiles"
          value={metrics ? formatInteger(metrics.scoredProfiles.total) : '—'}
          change={metrics ? `${formatInteger(metrics.scoredProfiles.scoreRecords)} score records · linked by MSISDN` : 'Loading live score registry'}
          tone="cyan"
        />
        <MetricCard
          icon={<Workflow />}
          label="Credit policies"
          value={metrics ? formatInteger(metrics.creditPolicies.total) : '—'}
          change={metrics ? `${formatInteger(metrics.creditPolicies.active)} active` : 'Loading decision policies'}
          tone="violet"
        />
        <MetricCard
          icon={<FileClock />}
          label="Pending reviews"
          value={metrics ? formatInteger(metrics.pendingReviews.total) : '—'}
          change={metrics ? `${formatInteger(metrics.pendingReviews.referenceData)} reference · ${formatInteger(metrics.pendingReviews.pricingFlows)} pricing · ${formatInteger(metrics.pendingReviews.treasuryFunding)} treasury · ${formatInteger(metrics.pendingReviews.kyc)} KYC` : 'Loading approval queues'}
          tone="amber"
        />
      </section>

      <section className="dashboard-grid">
        <div className="panel service-panel system-pulse-panel">
          <PanelHead
            eyebrow="INFRASTRUCTURE / AUTO REFRESH 15S"
            title="System pulse"
            action="Open full pulse"
            onAction={() => openModule('pulse')}
          />
          <div className="pulse-overview">
            <div className={`pulse-health ${degraded ? 'degraded' : checking ? 'checking' : 'operational'}`}>
              <div className="pulse-health-ring" style={{ '--health': `${healthPercent * 3.6}deg` } as CSSProperties}>
                <span><Activity /></span>
                <strong>{healthPercent}%</strong>
              </div>
              <div className="pulse-health-copy">
                <span>PLATFORM HEALTH</span>
                <h3>{degraded ? 'Attention required' : checking ? 'Integrity scan running' : 'All systems nominal'}</h3>
                <p>{degraded ? `${degraded} component${degraded === 1 ? '' : 's'} need investigation.` : 'Every monitored service is responding normally.'}</p>
                <div><i /> LIVE MONITORING <b>·</b> NEXT SCAN {nextScanSeconds}s</div>
              </div>
            </div>
            <div className="pulse-kpis">
              <div><span><Server /> COMPONENTS</span><strong>{services.length}</strong><small>{applicationServices.length} apps · {dependencyServices.length} dependencies</small></div>
              <div><span><CheckCircle2 /> OPERATIONAL</span><strong className="green-text">{operational}</strong><small>{healthPercent}% availability now</small></div>
              <div><span><AlertTriangle /> DEGRADED</span><strong className={degraded ? 'red-text' : ''}>{degraded}</strong><small>{checking ? `${checking} still checking` : 'No pending checks'}</small></div>
              <div><span><Gauge /> AVG LATENCY</span><strong>{averageLatency === null ? '—' : `${averageLatency}ms`}</strong><small>{pulseCheckedAt ? `Scanned ${secondsSinceCheck}s ago` : 'Starting integrity scan'}</small></div>
            </div>
          </div>
          {pulseError && <div className="pulse-error"><AlertTriangle /> {pulseError}</div>}
          <div className="pulse-compact-body">
            <div className="pulse-domain-strip">
              {pulseDomains.map((domain) => {
                const domainAttention = domain.services.filter((service) => service.state !== 'operational').length;
                return (
                  <button key={domain.id} onClick={() => openModule('pulse')} className={domainAttention ? 'attention' : ''}>
                    <span><PulseDomainIcon domain={domain.id} /><strong>{domain.label}</strong></span>
                    <b>{domain.services.filter((service) => service.state === 'operational').length}/{domain.services.length}</b>
                    <small>{domainAttention ? `${domainAttention} need attention` : 'All operational'}</small>
                  </button>
                );
              })}
            </div>
            {attentionServices.length ? (
              <div className="pulse-attention-list">
                <header><span><AlertTriangle /> ATTENTION REQUIRED</span><button onClick={onRefreshPulse}>{pulseRefreshing ? 'CHECKING…' : 'REFRESH'}</button></header>
                {attentionServices.slice(0, 4).map((service) => (
                  <button key={service.id} onClick={() => openModule('pulse')}>
                    <i className={service.state} /><div><strong>{service.label}</strong><small>{service.message || 'Awaiting health response'}</small></div><span>{service.latency === undefined ? service.state : `${service.latency} ms`}</span><ChevronRight />
                  </button>
                ))}
              </div>
            ) : (
              <div className="pulse-nominal"><CheckCircle2 /><div><strong>No active incidents</strong><span>All {services.length} monitored components are responding normally.</span></div><button onClick={onRefreshPulse}>{pulseRefreshing ? 'CHECKING…' : 'REFRESH NOW'}</button></div>
            )}
          </div>
        </div>

        <div className="panel decision-panel">
          <PanelHead eyebrow="CREDIT INTELLIGENCE" title="Decision pipeline" action="Open engine" onAction={() => openModule('credit')} />
          <div className="pipeline">
            <PipelineNode icon={<Sparkles />} label="AI score" detail="Category resolved" state="done" />
            <PipelineConnector />
            <PipelineNode icon={<Database />} label="Customer data" detail="274 rule fields" state="done" />
            <PipelineConnector />
            <PipelineNode icon={<ShieldCheck />} label="Policy gates" detail="Priority execution" state="active" />
            <PipelineConnector />
            <PipelineNode icon={<CreditCard />} label="Credit offer" detail="Limit + EMI" state="idle" />
          </div>
          <div className="decision-band">
            <div><span>RULE SOURCE</span><strong>credit_scored_customers</strong></div>
            <div><span>EXECUTION MODE</span><strong className="green-text">EXPLAINABLE</strong></div>
            <div><span>FAILURE POLICY</span><strong>FAIL CLOSED</strong></div>
          </div>
        </div>

        <div className="panel wallet-panel">
          <PanelHead eyebrow="TREASURY / LIVE BALANCES" title="System wallet balances" action="Treasury movement" onAction={openFunding} />
          {fundingMessage && <div className={`treasury-message ${/submitted/i.test(fundingMessage) ? 'success' : 'error'}`}>{fundingMessage}</div>}
          <div className="wallet-balance-summary">
            <WalletBalanceSummary
              label="TOTAL CUSTOMER BALANCE"
              balances={metrics?.customerWallets.balances || []}
              loading={!metrics}
            />
            <WalletBalanceSummary
              label="TOTAL MERCHANT BALANCE"
              balances={metrics?.merchantWallets.balances || []}
              loading={!metrics}
            />
          </div>
          <SystemWalletTable wallets={metrics?.systemWallets || []} loading={!metrics} />
        </div>

        <div className="panel controls-panel">
          <PanelHead eyebrow="SECURITY CONTROL" title="Operational posture" />
          <div className="posture-score">
            <div className="posture-ring"><span>98</span><small>/100</small></div>
            <div><strong>Hardened</strong><span>Core safeguards are active across this environment.</span></div>
          </div>
          <div className="control-list">
            <ControlItem label="Maker-checker policy" value="ENFORCED" />
            <ControlItem label="Sensitive data masking" value="ACTIVE" />
            <ControlItem label="Decision trace retention" value="ACTIVE" />
            <ControlItem label="Environment isolation" value="VERIFIED" />
          </div>
        </div>

        <div className="panel quick-panel">
          <PanelHead eyebrow="COMMAND SHORTCUTS" title="Quick actions" />
          <div className="quick-grid">
            <QuickAction icon={<Users />} label="Find customer" onClick={() => openModule('customers')} />
            <QuickAction icon={<WalletCards />} label="Customer wallets" onClick={() => openModule('customers')} />
            <QuickAction icon={<Workflow />} label="Simulate policy" onClick={() => openModule('credit')} />
            <QuickAction icon={<FileClock />} label="Review approvals" onClick={() => openModule('approvals')} />
          </div>
        </div>
      </section>
      {fundingOpen && <div className="record-drawer">
        <button className="drawer-scrim" onClick={() => setFundingOpen(false)} aria-label="Close treasury movement form" />
        <aside>
          <div className="drawer-head"><div><span>TREASURY MAKER</span><h2>Bank treasury movement</h2></div><button className="icon-button" onClick={() => setFundingOpen(false)}><X /></button></div>
          <div className="treasury-warning"><ShieldCheck /> Deposits and withdrawals require maker-checker approval. The wallet balance changes only after another administrator approves the movement.</div>
          <div className="configuration-form">
            <label>MOVEMENT TYPE<select value={fundingForm.operation} onChange={(event) => {
              const operation = event.target.value as TreasuryOperation;
              const currencies = fundingCurrencies(operation);
              setFundingForm({
                ...fundingForm,
                operation,
                currency: currencies[0] || '',
                fundingClassification:
                  operation === 'ADD_SAFEGUARDING' || operation === 'WITHDRAW_SAFEGUARDING'
                    ? ''
                    : 'NOT_APPLICABLE',
              });
            }}>
              <option value="ADD_SAFEGUARDING">Bank deposit → Safeguarding</option>
              <option value="ADD_COMMISSION_FUNDING">Bank deposit → Commission funding</option>
              <option value="WITHDRAW_SAFEGUARDING">Bank withdrawal ← Safeguarding</option>
              <option value="WITHDRAW_CHARGE_REVENUE">Gross profit withdrawal ← Charge collection</option>
            </select></label>
            {isSafeguardingMovement && <label>FUNDING SOURCE / ACCOUNTING CLASSIFICATION
              <select
                value={fundingForm.fundingClassification}
                onChange={(event) => setFundingForm({
                  ...fundingForm,
                  fundingClassification: event.target.value as TreasuryFundingClassification | '',
                })}
              >
                <option value="">Select the economic source</option>
                <option value="OWNER_INVESTMENT">Owner investment — Equity</option>
                <option value="CUSTOMER_FUNDS">Customer funds — Safeguarded liability</option>
                <option value="BANK_PREFUNDING">Bank / partner prefunding — Liability</option>
              </select>
              <small>This classification is immutable after submission and determines the balancing GL account.</small>
            </label>}
            <label>CURRENCY<select value={fundingForm.currency} onChange={(event) => setFundingForm({ ...fundingForm, currency: event.target.value })}>{fundingCurrencies(fundingForm.operation).map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
            <label>AMOUNT<input inputMode="decimal" placeholder="0.00" value={fundingForm.amount} onChange={(event) => setFundingForm({ ...fundingForm, amount: event.target.value.replace(/[^0-9.]/g, '') })} /></label>
            {isSafeguardingMovement && selectedContraLabel && <div className="treasury-journal-preview">
              <div><span>ACCOUNTING PREVIEW</span><strong>Balanced journal on checker approval</strong></div>
              <div className="treasury-journal-line"><b>DR</b><span>{isSafeguardingDeposit ? 'Safeguarding bank asset' : selectedContraLabel}</span><strong>{fundingForm.amount ? formatMoney(fundingForm.amount, fundingForm.currency || 'GBP') : '—'}</strong></div>
              <div className="treasury-journal-line"><b>CR</b><span>{isSafeguardingDeposit ? selectedContraLabel : 'Safeguarding bank asset'}</span><strong>{fundingForm.amount ? formatMoney(fundingForm.amount, fundingForm.currency || 'GBP') : '—'}</strong></div>
              <small>{fundingForm.fundingClassification === 'OWNER_INVESTMENT' ? 'Balance-sheet equity; no P&L impact.' : 'Balance-sheet liability; no P&L impact.'}</small>
            </div>}
            <label>BANK NAME<input placeholder="Bank name" value={fundingForm.bankName} onChange={(event) => setFundingForm({ ...fundingForm, bankName: event.target.value })} /></label>
            <label>BANK ACCOUNT / IBAN<input placeholder="Source or beneficiary account" value={fundingForm.bankAccount} onChange={(event) => setFundingForm({ ...fundingForm, bankAccount: event.target.value })} /></label>
            <label>BANK TRANSACTION REFERENCE<input placeholder="BANK-2026-001" value={fundingForm.reference} onChange={(event) => setFundingForm({ ...fundingForm, reference: event.target.value.toUpperCase().replace(/[^A-Z0-9._/-]/g, '') })} /></label>
            <div className="themed-date-field"><span>VALUE DATE</span><ThemedDatePicker value={fundingForm.valueDate} onChange={(value) => setFundingForm({ ...fundingForm, valueDate: value })} placeholder="Select value date" contextLabel="VALUE DATE / BANK SETTLEMENT" /></div>
            <label>BANK TRANSACTION DOCUMENT<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setFundingFile(event.target.files?.[0] || null)} /><small>{fundingFile ? `${fundingFile.name} · ${(fundingFile.size / 1024 / 1024).toFixed(2)} MB` : 'PDF, PNG, or JPEG · maximum 10 MB · stored privately in MinIO'}</small></label>
            <label>MOVEMENT REASON<textarea rows={4} placeholder="State the source, beneficiary, and business reason" value={fundingForm.comment} onChange={(event) => setFundingForm({ ...fundingForm, comment: event.target.value })} /></label>
            <button className="command-button" disabled={fundingSubmitting || !fundingForm.currency || !fundingFile || (isSafeguardingMovement && !fundingForm.fundingClassification)} onClick={() => void submitFunding()}>{fundingSubmitting ? <LoaderCircle className="spin" /> : <ShieldCheck />} UPLOAD & SUBMIT FOR APPROVAL</button>
          </div>
        </aside>
      </div>}
    </>
  );
}

const pulseDomainDefinitions = [
  { id: 'channels', label: 'Channels', detail: 'Operator and account-user experiences', serviceIds: ['admin-ui', 'portal-ui'] },
  { id: 'money', label: 'Money movement', detail: 'Transactions, events, ledger, and reporting', serviceIds: ['producer', 'consumer', 'accounting'] },
  { id: 'risk', label: 'Risk & identity', detail: 'Credit decisions, KYC, OCR, and screening', serviceIds: ['credit-rules', 'kyc', 'kyc-ocr'] },
  { id: 'integrations', label: 'Integrations', detail: 'External connectors and transaction simulators', serviceIds: ['mock-merchant'] },
  { id: 'platform', label: 'Platform', detail: 'Database, messaging, cache, and private storage', serviceIds: ['postgres', 'kafka', 'redis', 'minio'] },
] as const;

function groupPulseServices(services: ServiceHealth[]): PulseDomain[] {
  const claimed = new Set<string>();
  const domains: PulseDomain[] = pulseDomainDefinitions.map((definition) => {
    const members = services.filter((service) => definition.serviceIds.some((id) => id === service.id));
    members.forEach((service) => claimed.add(service.id));
    return { id: definition.id, label: definition.label, detail: definition.detail, services: members };
  }).filter((domain) => domain.services.length);
  const other = services.filter((service) => !claimed.has(service.id));
  if (other.length) domains.push({ id: 'other', label: 'Other services', detail: 'Newly registered monitored components', services: other });
  return domains;
}

function PulseDomainIcon({ domain }: { domain: string }) {
  if (domain === 'channels') return <Network />;
  if (domain === 'money') return <Zap />;
  if (domain === 'risk') return <ShieldCheck />;
  if (domain === 'integrations') return <Workflow />;
  return <Database />;
}

function SystemPulseWorkspace({
  services,
  pulseRefreshing,
  pulseCheckedAt,
  pulseError,
  onRefresh,
}: {
  services: ServiceHealth[];
  pulseRefreshing: boolean;
  pulseCheckedAt: string;
  pulseError: string;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention' | 'operational'>('all');
  const normalizedQuery = query.trim().toLowerCase();
  const operational = services.filter((service) => service.state === 'operational').length;
  const degraded = services.filter((service) => service.state === 'degraded').length;
  const checking = services.filter((service) => service.state === 'checking').length;
  const latencies = services.flatMap((service) => service.latency === undefined ? [] : [service.latency]);
  const averageLatency = latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null;
  const filteredDomains = groupPulseServices(services).map((domain) => ({
    ...domain,
    services: domain.services.filter((service) => {
      const matchesQuery = !normalizedQuery || `${service.id} ${service.label} ${service.detail} ${service.message || ''}`.toLowerCase().includes(normalizedQuery);
      const matchesFilter = filter === 'all' || (filter === 'attention' ? service.state !== 'operational' : service.state === 'operational');
      return matchesQuery && matchesFilter;
    }),
  })).filter((domain) => domain.services.length);

  return (
    <section className="module-workspace pulse-workspace">
      <ModuleHeader
        eyebrow="INFRASTRUCTURE / LIVE MONITORING"
        title="System pulse"
        copy="One operational view of every Finify channel, financial service, risk control, integration, and platform dependency."
        action={pulseRefreshing ? 'Checking…' : 'Refresh now'}
        onAction={onRefresh}
      />
      {pulseError && <div className="pulse-error"><AlertTriangle /> {pulseError}</div>}
      <div className="pulse-workspace-summary">
        <div><span><Server /> COMPONENTS</span><strong>{services.length}</strong><small>Across {groupPulseServices(services).length} operating domains</small></div>
        <div><span><CheckCircle2 /> OPERATIONAL</span><strong className="green-text">{operational}</strong><small>{services.length ? Math.round((operational / services.length) * 100) : 0}% available now</small></div>
        <div><span><AlertTriangle /> ATTENTION</span><strong className={degraded ? 'red-text' : ''}>{degraded + checking}</strong><small>{degraded} degraded · {checking} checking</small></div>
        <div><span><Gauge /> AVG LATENCY</span><strong>{averageLatency === null ? '—' : `${averageLatency}ms`}</strong><small>{pulseCheckedAt ? `Last scan ${formatDate(pulseCheckedAt)}` : 'Integrity scan starting'}</small></div>
      </div>
      <div className="pulse-inventory-toolbar">
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a service or health message" /></label>
        <div>
          {(['all', 'attention', 'operational'] as const).map((option) => <button key={option} className={filter === option ? 'active' : ''} onClick={() => setFilter(option)}>{option}</button>)}
        </div>
      </div>
      <div className="pulse-domain-inventory">
        {filteredDomains.map((domain) => <PulseDomainSection key={`${domain.id}:${domain.services.some((service) => service.state !== 'operational')}`} domain={domain} />)}
        {!filteredDomains.length && <div className="pulse-inventory-empty"><Search /><strong>No services match this view</strong><span>Clear the search or select another health filter.</span></div>}
      </div>
    </section>
  );
}

function PulseDomainSection({ domain }: { domain: PulseDomain }) {
  const hasAttention = domain.services.some((service) => service.state !== 'operational');
  const [open, setOpen] = useState(hasAttention);
  const operational = domain.services.filter((service) => service.state === 'operational').length;
  return (
    <section className={`pulse-domain-section panel ${hasAttention ? 'attention' : ''}`}>
      <button className="pulse-domain-head" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span className="pulse-domain-icon"><PulseDomainIcon domain={domain.id} /></span>
        <div><strong>{domain.label}</strong><small>{domain.detail}</small></div>
        <span className={hasAttention ? 'domain-state attention' : 'domain-state'}><i />{hasAttention ? `${domain.services.length - operational} attention` : 'operational'}</span>
        <b>{operational}/{domain.services.length}</b>
        <ChevronRight className={open ? 'open' : ''} />
      </button>
      {open && <div className="pulse-inventory-list">{[...domain.services].sort((a, b) => Number(a.state === 'operational') - Number(b.state === 'operational')).map((service) => <PulseInventoryRow key={service.id} service={service} />)}</div>}
    </section>
  );
}

function PulseInventoryRow({ service }: { service: ServiceHealth }) {
  return (
    <div className={`pulse-inventory-row ${service.state}`}>
      <span className={`service-orb ${service.state}`}>{service.category === 'APPLICATION' ? <Server /> : <Database />}</span>
      <div className="pulse-inventory-name"><small>{service.id.replaceAll('-', ' ')}</small><strong>{service.label}</strong></div>
      <p>{service.detail}</p>
      <em>{service.message || (service.state === 'checking' ? 'Awaiting health response' : 'Health check completed')}</em>
      <b>{service.latency === undefined ? '—' : `${service.latency} ms`}</b>
      <span className={`service-state ${service.state}`}><i />{service.state}</span>
    </div>
  );
}

function ModuleWorkspace({
  moduleId,
  title,
  token,
  profile,
  openCommand,
  onNavigate,
  onExpired,
}: {
  moduleId: string;
  title: string;
  token: string;
  profile: AdminProfile;
  openCommand: () => void;
  onNavigate: (moduleId: string) => void;
  onExpired: () => void;
}) {
  if (moduleId === 'customers') return <CustomerWorkspace token={token} onExpired={onExpired} />;
  if (moduleId === 'wallets') return <CustomerWorkspace token={token} onExpired={onExpired} />;
  if (moduleId === 'transactions') return <TransactionsWorkspace token={token} onExpired={onExpired} />;
  if (moduleId === 'kyc') return <KycWorkspace token={token} profile={profile} />;
  if (moduleId === 'onboarding') return <OnboardingJourneyExperience token={token} profile={profile} />;
  if (moduleId === 'onboarding-channels') return <OnboardingChannelExperience token={token} profile={profile} />;
  if (moduleId === 'credit') return <CreditWorkspace token={token} />;
  if (moduleId === 'loans') return <CreditCommercialExperience token={token} profile={profile} />;
  if (moduleId === 'charges') {
    return <PricingFlowExperience token={token} profile={profile} initialFocus="charge" />;
  }
  if (moduleId === 'risk') return <AmlWorkspace token={token} profile={profile} />;
  if (moduleId === 'accounting') return <AccountingWorkspace token={token} profile={profile} />;
  if (moduleId === 'approvals') return <ApprovalWorkspace token={token} profile={profile} />;
  if (moduleId === 'access') return <AccessControlWorkspace token={token} profile={profile} />;
  if (moduleId === 'configuration') {
    return (
      <ReferenceDataExperience
        token={token}
        profile={profile}
        onOpenAml={() => onNavigate('risk')}
      />
    );
  }

  const moduleCopy: Record<string, { eyebrow: string; copy: string; icon: ReactNode }> = {
    customers: { eyebrow: 'CUSTOMER INTELLIGENCE', copy: 'Identity, KYC, scoring, wallets, and decision history in one protected view.', icon: <Users /> },
    transactions: { eyebrow: 'MONEY MOVEMENT', copy: 'Trace transaction state, ledger impact, AML reservation, and settlement outcomes.', icon: <ReceiptText /> },
    loans: { eyebrow: 'LENDING CONTROL', copy: 'Configure installment, invoice-finance, and revolving-credit products.', icon: <CircleDollarSign /> },
    collections: { eyebrow: 'REPAYMENT OPERATIONS', copy: 'Monitor EMI schedules, partial collections, arrears, and DPD progression.', icon: <Clock3 /> },
    funders: { eyebrow: 'CAPITAL NETWORK', copy: 'Manage Finify and bank funders, balances, allocation fairness, and exposure.', icon: <Landmark /> },
    configuration: { eyebrow: 'SYSTEM CONTROL', copy: 'Manage reference data, integrations, permissions, and environment policy.', icon: <Settings /> },
    access: { eyebrow: 'IDENTITY GOVERNANCE', copy: 'Create roles, allocate privileges, and manage administrative identities.', icon: <UserCog /> },
  };
  const selected = moduleCopy[moduleId] || moduleCopy.configuration;
  return (
    <section className="module-workspace">
      <ModuleHeader eyebrow={selected.eyebrow} title={title} copy={selected.copy} action="Open command bar" onAction={openCommand} />
      <div className="module-empty panel">
        <span className="module-icon">{selected.icon}</span>
        <p className="mono-kicker">MODULE FOUNDATION ACTIVE</p>
        <h2>{title} workspace</h2>
        <p>This module is connected to the Obsidian navigation and ready for its operational workflow.</p>
        <button className="outline-command" onClick={openCommand}><Command /> OPEN COMMAND BAR</button>
      </div>
    </section>
  );
}

function OnboardingJourneyExperience({ token,profile }:{ token:string;profile:AdminProfile }) {
  const request:OnboardingAdminRequest=useCallback(
    async <T,>(route:string,init?:{ method?:string;body?:unknown;headers?:Record<string,string> }):Promise<T>=>
      adminRequest<T>(route,token,init),[token],
  );
  return <OnboardingJourneyWorkspace request={request} profile={profile}/>;
}

function OnboardingChannelExperience({token,profile}:{token:string;profile:AdminProfile}) {
  const request:ChannelAdminRequest=useCallback(
    async <T,>(route:string,init?:{method?:string;body?:unknown;headers?:Record<string,string>}):Promise<T>=>
      adminRequest<T>(route,token,init),[token],
  );
  return <OnboardingChannelWorkspace request={request} profile={profile}/>;
}

function CreditCommercialExperience({token,profile}:{token:string;profile:AdminProfile}) {
  const request: CreditCommercialRequest = useCallback(
    async <T,>(route:string,init?:{method?:string;body?:unknown}):Promise<T> =>
      adminRequest<T>(route,token,init),[token],
  );
  return <CreditCommercialWorkspace request={request} profile={profile}/>;
}

function PricingFlowExperience({
  token,
  profile,
  initialFocus,
}: {
  token: string;
  profile: AdminProfile;
  initialFocus: 'charge' | 'commission';
}) {
  const request: PricingAdminRequest = useCallback(
    async <T,>(route: string, init?: { method?: string; body?: unknown }): Promise<T> =>
      adminRequest<T>(route, token, init),
    [token],
  );
  return (
    <PricingFlowWorkspace
      request={request}
      profile={profile}
      initialFocus={initialFocus}
    />
  );
}

function ReferenceDataExperience({
  token,
  profile,
  onOpenAml,
}: {
  token: string;
  profile: AdminProfile;
  onOpenAml: () => void;
}) {
  const [tab, setTab] = useState<'reference' | 'security' | 'assistant'>('reference');
  const canConfigureAssistant = profile.roles?.includes('super_admin')
    || profile.permissions?.includes('assistant.configure');
  const request: ReferenceDataRequest = useCallback(
    async <T,>(route: string, init?: { method?: string; body?: unknown }): Promise<T> =>
      adminRequest<T>(route, token, init),
    [token],
  );
  return (
    <section className="configuration-workspace">
      <div className="configuration-section-tabs">
        <button className={tab === 'reference' ? 'active' : ''} onClick={() => setTab('reference')}><Database /> REFERENCE DATA</button>
        <button className={tab === 'security' ? 'active' : ''} onClick={() => setTab('security')}><ShieldCheck /> SECURITY & MFA</button>
        {canConfigureAssistant && <button className={tab === 'assistant' ? 'active' : ''} onClick={() => setTab('assistant')}><Sparkles /> MR. FINIFY</button>}
      </div>
      {tab === 'reference' ? (
        <ReferenceDataWorkspace request={request} profile={profile} onOpenAml={onOpenAml} />
      ) : tab === 'security' ? (
        <SecurityConfiguration token={token} profile={profile} />
      ) : (
        <MrFinifyConfiguration token={token} profile={profile} />
      )}
    </section>
  );
}

type MrFinifyConfigurationState = {
  configured: boolean;
  model: string;
  endpoint: string;
  reasoningEffort: string;
  responseVerbosity: string;
  rateLimitPerMinute: number;
  apiKeySource: 'SECURE_DATABASE' | 'ENVIRONMENT' | 'MISSING';
  apiKeyWriteOnly: boolean;
  encryptionKeyConfigured: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
  availableModels: MrFinifyModelOption[];
  pricingBasis: string;
  pricingCheckedAt: string;
};

type MrFinifyModelOption = {
  id: string;
  label: string;
  costTier: string;
  recommendation: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
};

const DEFAULT_MR_FINIFY_MODELS: MrFinifyModelOption[] = [
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', costTier: 'LOWEST COST', recommendation: 'Recommended for routine, high-volume administration', inputUsdPerMillionTokens: 0.2, outputUsdPerMillionTokens: 1.2 },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', costTier: 'BALANCED', recommendation: 'Balanced intelligence and cost for complex operations', inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 12 },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', costTier: 'PREMIUM', recommendation: 'Highest capability for the most complex analysis', inputUsdPerMillionTokens: 5, outputUsdPerMillionTokens: 30 },
];

function MrFinifyConfiguration({ token, profile }: { token: string; profile: AdminProfile }) {
  const canManage = profile.roles?.includes('super_admin')
    || profile.permissions?.includes('assistant.configure');
  const [settings, setSettings] = useState<MrFinifyConfigurationState | null>(null);
  const [form, setForm] = useState({ apiKey: '', model: 'gpt-5.6-sol', rateLimitPerMinute: 20 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const modelOptions = settings?.availableModels?.length ? settings.availableModels : DEFAULT_MR_FINIFY_MODELS;
  const selectedModel = modelOptions.find((option) => option.id === form.model) || modelOptions[0];

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const next = await adminRequest<MrFinifyConfigurationState>('/admin/assistant/configuration', token);
      setSettings(next);
      setForm((current) => ({
        ...current,
        apiKey: '',
        model: next.model || 'gpt-5.6-sol',
        rateLimitPerMinute: Number(next.rateLimitPerMinute || 20),
      }));
    } catch (requestError) { setError((requestError as Error).message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!canManage) return;
    const pendingLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(pendingLoad);
  }, [canManage, load]);

  const save = async (removeApiKey = false) => {
    setSaving(true); setError(''); setMessage('');
    try {
      const next = await adminRequest<MrFinifyConfigurationState>('/admin/assistant/configuration', token, {
        method: 'POST',
        body: {
          model: form.model.trim(),
          rateLimitPerMinute: Number(form.rateLimitPerMinute),
          ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
          ...(removeApiKey ? { removeApiKey: true } : {}),
        },
      });
      setSettings(next);
      setForm((current) => ({ ...current, apiKey: '' }));
      setMessage(removeApiKey
        ? 'The database API key was removed. Environment fallback remains available if configured.'
        : 'Mr. Finify configuration saved and activated immediately.');
    } catch (requestError) { setError((requestError as Error).message); }
    finally { setSaving(false); }
  };

  if (!canManage) return <section className="security-config-shell panel"><div className="security-config-denied"><LockKeyhole /><h2>Restricted configuration</h2><p>Mr. Finify configuration requires the Assistant Configuration privilege.</p></div></section>;
  return (
    <section className="security-config-shell">
      <ModuleHeader eyebrow="CONFIGURATION / FINIFY INTELLIGENCE" title="Mr. Finify" copy="Configure the server-side OpenAI connection without exposing credentials to the browser, logs, or assistant conversations." action="Refresh configuration" onAction={() => void load()} />
      <div className="security-config-status">
        <div><Sparkles /><span>ASSISTANT STATE</span><strong>{settings?.configured ? 'READY' : 'KEY REQUIRED'}</strong><small>{settings?.configured ? 'Secure OpenAI connection configured' : 'Add a server-side API key below'}</small></div>
        <div><LockKeyhole /><span>API KEY CUSTODY</span><strong>{settings?.apiKeySource?.replaceAll('_', ' ') || 'CHECKING'}</strong><small>Write-only · value is never returned</small></div>
        <div><ShieldCheck /><span>ENCRYPTION ROOT</span><strong>{settings?.encryptionKeyConfigured ? 'PROTECTED' : 'MISSING'}</strong><small>Root key remains outside the database and UI</small></div>
      </div>
      <div className="security-config-grid">
        <div className="panel security-config-form">
          <PanelHead eyebrow="OPENAI CONNECTION" title="Runtime configuration" />
          {loading ? <div className="table-loading"><LoaderCircle className="spin" /> Loading Mr. Finify configuration…</div> : <div className="security-config-fields">
            <label><span>OPENAI API KEY</span><input type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={settings?.configured ? '••••••••  Leave blank to retain current key' : 'Enter server-side OpenAI API key'} autoComplete="new-password" /><small>The key is encrypted with AES-256-GCM. The existing value cannot be viewed or copied back.</small></label>
            <label><span>MODEL & COST TIER</span><select value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })}>{modelOptions.map((option) => <option key={option.id} value={option.id}>{option.label} · {option.costTier}</option>)}</select><small>Only approved models can be selected; arbitrary model identifiers are blocked by the API.</small></label>
            {selectedModel && <div className="mr-finify-cost-card"><CircleDollarSign /><div><span>{selectedModel.costTier}</span><strong>{selectedModel.label}</strong><p>{selectedModel.recommendation}</p></div><dl><div><dt>INPUT</dt><dd>${selectedModel.inputUsdPerMillionTokens.toFixed(2)}</dd></div><div><dt>OUTPUT</dt><dd>${selectedModel.outputUsdPerMillionTokens.toFixed(2)}</dd></div></dl><small>Per 1M tokens · Standard processing · short context. Actual spend depends on token usage.</small></div>}
            <label><span>REQUESTS PER USER / MINUTE</span><input type="number" min={1} max={100} value={form.rateLimitPerMinute} onChange={(event) => setForm({ ...form, rateLimitPerMinute: Number(event.target.value) })} /><small>Applies independently to each authenticated administrator.</small></label>
            {error && <div className="access-error"><AlertTriangle />{error}</div>}
            {message && <div className="security-config-success"><CheckCircle2 />{message}</div>}
            <button className="command-button" disabled={saving || !form.model.trim() || form.rateLimitPerMinute < 1 || form.rateLimitPerMinute > 100 || (!settings?.configured && form.apiKey.trim().length < 20)} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" /> : <Sparkles />}{saving ? 'SECURING CONFIGURATION' : 'SAVE & ACTIVATE'}<ArrowRight /></button>
            {settings?.apiKeySource === 'SECURE_DATABASE' && <button className="outline-command" disabled={saving} onClick={() => { if (window.confirm('Remove the stored Mr. Finify API key?')) void save(true); }}><X /> REMOVE DATABASE KEY</button>}
          </div>}
        </div>
        <aside className="panel security-config-guidance">
          <PanelHead eyebrow="SECRET CONTROL" title="Protected by design" />
          <div><LockKeyhole /><strong>Server-side only</strong><p>The API key is decrypted only inside the producer when Mr. Finify makes an OpenAI request. It is never included in browser responses.</p></div>
          <div><ShieldAlert /><strong>Key replacement</strong><p>Enter a new key and save to rotate it immediately. Leave the field blank when changing only the model or rate limit.</p></div>
          <div><Activity /><strong>Audited updates</strong><p>Configuration changes record the administrator, time, model, rate limit and key status—never the key itself.</p></div>
          <div><CircleDollarSign /><strong>Cost-aware selection</strong><p>Luna is the recommended default for routine admin work. Use Terra or Sol only when the task requires greater reasoning capability.</p></div>
          {settings?.updatedAt && <footer>LAST CONFIGURATION UPDATE · {new Date(settings.updatedAt).toLocaleString()}</footer>}
        </aside>
      </div>
    </section>
  );
}

type SecurityConfigurationState = {
  captchaEnabled: boolean;
  turnstileSiteKey: string;
  turnstileSecretConfigured: boolean;
  turnstileSecretSource: 'SECURE_DATABASE' | 'ENVIRONMENT' | 'MISSING';
  mfaIssuer: string;
  encryptionKeyConfigured: boolean;
  encryptionKeyManagedExternally: boolean;
  updatedAt?: string;
};

function SecurityConfiguration({ token, profile }: { token: string; profile: AdminProfile }) {
  const [settings, setSettings] = useState<SecurityConfigurationState | null>(null);
  const [form, setForm] = useState({ captchaEnabled: true, turnstileSiteKey: '', turnstileSecret: '', mfaIssuer: 'Finify Admin' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canManage = profile.roles?.includes('super_admin') || profile.permissions?.includes('admin_users.manage');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const next = await adminRequest<SecurityConfigurationState>('/admin/access/security-settings', token);
      setSettings(next);
      setForm({ captchaEnabled: next.captchaEnabled, turnstileSiteKey: next.turnstileSiteKey || '', turnstileSecret: '', mfaIssuer: next.mfaIssuer || 'Finify Admin' });
    } catch (requestError) { setError((requestError as Error).message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!canManage) return;
    const pendingLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(pendingLoad);
  }, [canManage, load]);

  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const next = await adminRequest<SecurityConfigurationState>('/admin/access/security-settings', token, {
        method: 'PATCH',
        body: {
          captchaEnabled: form.captchaEnabled,
          turnstileSiteKey: form.turnstileSiteKey.trim(),
          mfaIssuer: form.mfaIssuer.trim(),
          ...(form.turnstileSecret.trim() ? { turnstileSecret: form.turnstileSecret.trim() } : {}),
        },
      });
      setSettings(next);
      setForm((current) => ({ ...current, turnstileSecret: '' }));
      setMessage('Security configuration saved. New login attempts will use these settings immediately.');
    } catch (requestError) { setError((requestError as Error).message); }
    finally { setSaving(false); }
  };

  if (!canManage) return <section className="security-config-shell panel"><div className="security-config-denied"><LockKeyhole /><h2>Restricted configuration</h2><p>Security and MFA settings require the Admin User Management privilege.</p></div></section>;
  return (
    <section className="security-config-shell">
      <ModuleHeader eyebrow="CONFIGURATION / IDENTITY SECURITY" title="Security & MFA" copy="Control bot protection and authenticator identity without exposing private secrets to the browser." action="Refresh configuration" onAction={() => void load()} />
      <div className="security-config-status">
        <div><ShieldCheck /><span>ADMIN MFA</span><strong>MANDATORY</strong><small>TOTP required for every administrator</small></div>
        <div><LockKeyhole /><span>ENCRYPTION ROOT</span><strong>{settings?.encryptionKeyConfigured ? 'PROTECTED' : 'MISSING'}</strong><small>Managed outside the UI to protect enrolled users</small></div>
        <div><Gauge /><span>TURNSTILE SECRET</span><strong>{settings?.turnstileSecretConfigured ? 'CONFIGURED' : 'MISSING'}</strong><small>{settings?.turnstileSecretSource?.replaceAll('_', ' ') || 'Checking secure source'}</small></div>
      </div>
      <div className="security-config-grid">
        <div className="panel security-config-form">
          <PanelHead eyebrow="LOGIN DEFENCE" title="Cloudflare Turnstile" />
          {loading ? <div className="table-loading"><LoaderCircle className="spin" /> Loading security policy…</div> : <div className="security-config-fields">
            <label className="security-switch"><div><strong>Require CAPTCHA</strong><span>Validate a fresh Turnstile token before checking credentials.</span></div><input type="checkbox" checked={form.captchaEnabled} onChange={(event) => setForm({ ...form, captchaEnabled: event.target.checked })} /><i /></label>
            <label><span>TURNSTILE SITE KEY</span><input value={form.turnstileSiteKey} onChange={(event) => setForm({ ...form, turnstileSiteKey: event.target.value })} placeholder="Public widget site key" autoComplete="off" /></label>
            <label><span>TURNSTILE SECRET KEY</span><input type="password" value={form.turnstileSecret} onChange={(event) => setForm({ ...form, turnstileSecret: event.target.value })} placeholder={settings?.turnstileSecretConfigured ? '••••••••  Leave blank to keep current secret' : 'Enter private server secret'} autoComplete="new-password" /><small>The existing secret is write-only and is never returned by the API.</small></label>
            <label><span>AUTHENTICATOR ISSUER</span><input value={form.mfaIssuer} onChange={(event) => setForm({ ...form, mfaIssuer: event.target.value })} placeholder="Finify Admin" maxLength={120} /><small>This name appears inside authenticator applications.</small></label>
            {error && <div className="access-error"><AlertTriangle />{error}</div>}
            {message && <div className="security-config-success"><CheckCircle2 />{message}</div>}
            <button className="command-button" disabled={saving || !form.mfaIssuer.trim() || (form.captchaEnabled && !form.turnstileSiteKey.trim())} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" /> : <ShieldCheck />}{saving ? 'SAVING POLICY' : 'SAVE SECURITY POLICY'}<ArrowRight /></button>
          </div>}
        </div>
        <aside className="panel security-config-guidance">
          <PanelHead eyebrow="KEY CUSTODY" title="MFA encryption key" />
          <div><LockKeyhole /><strong>Environment controlled</strong><p>The root encryption key cannot be edited here. Changing it without a coordinated migration would invalidate every enrolled authenticator.</p></div>
          <div><ShieldAlert /><strong>Emergency recovery</strong><p>A Super Admin can reset an individual authenticator from User Management. The user will receive a new QR code and recovery PIN at the next login.</p></div>
          <div><Activity /><strong>Immediate activation</strong><p>Turnstile and issuer changes apply to new login and enrolment attempts as soon as this form is saved.</p></div>
          {settings?.updatedAt && <footer>LAST POLICY UPDATE · {new Date(settings.updatedAt).toLocaleString()}</footer>}
        </aside>
      </div>
    </section>
  );
}

function CustomerWorkspace({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState<'overview' | 'profile' | 'wallets' | 'credit'>('overview');
  const [editing, setEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', email: '', address: '', kycStatus: '0' });
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [customerWalletTypes, setCustomerWalletTypes] = useState<CustomerWalletType[]>([]);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    msisdn: '',
    firstName: '',
    lastName: '',
    email: '',
    address: '',
    defaultCurrency: '',
    iban: '',
    swiftBic: '',
    walletCode: '103',
    documentType: 'UGANDA_NATIONAL_ID',
    issuingCountry: 'UGA',
  });
  const [walletFormOpen, setWalletFormOpen] = useState(false);
  const [walletForm, setWalletForm] = useState({ currency: '', iban: '', swiftBic: '' });
  const [routingWalletId, setRoutingWalletId] = useState('');
  const [routingForm, setRoutingForm] = useState({ iban: '', swiftBic: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminRequest<{ data: CustomerRow[]; totalRecords: number }>(
        `/admin/operations/customers?page=${page}&limit=${pageSize}&search=${encodeURIComponent(query)}`,
        token,
      );
      setCustomers(result.data || []);
      setTotal(Number(result.totalRecords || 0));
    } catch (requestError) {
      const message = (requestError as Error).message;
      setError(message);
      if (/unauthorized|token|401/i.test(message)) onExpired();
    } finally {
      setLoading(false);
    }
  }, [onExpired, page, query, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const today = new Date().toISOString().slice(0, 10);
      void adminRequest<Array<Record<string, unknown>>>(
        `/admin/operations/accounting/v1/accounting/configurations/currencies?reportingEntity=FINIFY_UK&businessDate=${today}`,
        token,
      ).then((rows) => {
        const configured = rows.filter((row) => row.configured).map((row) => String(row.currency));
        setCurrencies(configured);
        setCustomerForm((current) => ({ ...current, defaultCurrency: current.defaultCurrency || configured[0] || '' }));
        setWalletForm((current) => ({ ...current, currency: current.currency || configured[0] || '' }));
      }).catch(() => setCurrencies([]));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [token]);
  useEffect(() => {
    void adminRequest<CustomerWalletType[]>('/admin/wallets/customer-types/eligible', token)
      .then((rows) => {
        setCustomerWalletTypes(rows || []);
        setCustomerForm((current) => ({
          ...current,
          walletCode: String(rows.find((row) => row.walletCode === 103)?.walletCode || rows[0]?.walletCode || current.walletCode),
        }));
      })
      .catch(() => setCustomerWalletTypes([]));
  }, [token]);

  const loadDetail = useCallback(async (customerId: string) => {
    setDetailLoading(true);
    try {
      const result = await adminRequest<CustomerDetail>(
        `/admin/operations/customers/${customerId}`,
        token,
      );
      setDetail(result);
      setSelected(result.profile);
      setProfileForm({
        firstName: result.profile.firstName || '',
        lastName: result.profile.lastName || '',
        email: result.profile.email || '',
        address: result.profile.address || '',
        kycStatus: String(result.profile.kycStatus ?? 0),
      });
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  const changeStatus = async (customer: CustomerRow, status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED') => {
    setError('');
    try {
      await adminRequest(`/admin/operations/customers/${customer.customerId}/status`, token, {
        method: 'PATCH',
        body: { status, reason: `Changed to ${status} from Finify Command` },
      });
      await Promise.all([load(), loadDetail(customer.customerId)]);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };
  const openCustomer = (customer: CustomerRow) => {
    setSelected(customer);
    setDetail(null);
    setTab('overview');
    setEditing(false);
    setProfileForm({
      firstName: customer.firstName || '',
      lastName: customer.lastName || '',
      email: customer.email || '',
      address: customer.address || '',
      kycStatus: String(customer.kycStatus ?? 0),
    });
    void loadDetail(customer.customerId);
  };
  const saveProfile = async () => {
    if (!selected) return;
    try {
      await adminRequest(`/admin/operations/customers/${selected.customerId}`, token, {
        method: 'PATCH',
        body: {
          firstName: profileForm.firstName,
          lastName: profileForm.lastName,
          email: profileForm.email,
          address: profileForm.address,
        },
      });
      setEditing(false);
      await Promise.all([load(), loadDetail(selected.customerId)]);
    } catch (requestError) { setError((requestError as Error).message); }
  };
  const createCustomer = async () => {
    setError('');
    setNotice('');
    try {
      const result = await adminRequest<{
        profile: CustomerRow;
        wallet: WalletRow | null;
        accountOpening?: { status: string; message?: string };
      }>(
        '/admin/wallets/customers',
        token,
        { method: 'POST', body: { ...customerForm, walletCode: Number(customerForm.walletCode) } },
      );
      setCustomerFormOpen(false);
      setCustomerForm({
        msisdn: '',
        firstName: '',
        lastName: '',
        email: '',
        address: '',
        defaultCurrency: currencies[0] || '',
        iban: '',
        swiftBic: '',
        walletCode: String(customerWalletTypes.find((row) => row.walletCode === 103)?.walletCode || customerWalletTypes[0]?.walletCode || 103),
        documentType: 'UGANDA_NATIONAL_ID',
        issuingCountry: 'UGA',
      });
      setNotice(result.wallet
        ? 'Customer and default wallet opened successfully.'
        : result.accountOpening?.message || 'Customer profile created. KYC approval is required before wallet opening.');
      await load();
      if (result.profile?.customerId) {
        setTab(result.accountOpening?.status === 'PENDING_KYC' ? 'profile' : 'wallets');
        await loadDetail(result.profile.customerId);
      }
    } catch (requestError) { setError((requestError as Error).message); }
  };
  const completeAccountOpening = async () => {
    if (!selected) return;
    setError('');
    setNotice('');
    try {
      await adminRequest(`/admin/wallets/customers/${selected.customerId}/complete-opening`, token, {
        method: 'POST',
      });
      setNotice('KYC eligibility confirmed and the default wallet was opened successfully.');
      await Promise.all([load(), loadDetail(selected.customerId)]);
    } catch (requestError) { setError((requestError as Error).message); }
  };
  const addCurrencyWallet = async () => {
    if (!selected) return;
    try {
      await adminRequest(`/admin/wallets/customers/${selected.customerId}`, token, {
        method: 'POST',
        body: { walletCode: 103, ...walletForm },
      });
      setWalletFormOpen(false);
      setWalletForm({ currency: currencies[0] || '', iban: '', swiftBic: '' });
      await Promise.all([load(), loadDetail(selected.customerId)]);
    } catch (requestError) { setError((requestError as Error).message); }
  };
  const saveRouting = async () => {
    if (!selected || !routingWalletId) return;
    try {
      await adminRequest(`/admin/wallets/${routingWalletId}/routing`, token, {
        method: 'PATCH',
        body: routingForm,
      });
      setRoutingWalletId('');
      await loadDetail(selected.customerId);
    } catch (requestError) { setError((requestError as Error).message); }
  };
  const setDefaultWallet = async (wallet: WalletRow) => {
    if (!selected) return;
    try {
      await adminRequest(`/admin/wallets/${wallet.walletId}/default`, token, { method: 'POST' });
      await Promise.all([load(), loadDetail(selected.customerId)]);
    } catch (requestError) { setError((requestError as Error).message); }
  };
  const setWalletStatus = async (
    wallet: WalletRow,
    status: 'ACTIVE' | 'SUSPENDED' | 'FROZEN',
  ) => {
    if (!selected) return;
    try {
      await adminRequest(`/admin/wallets/${wallet.walletId}/status`, token, {
        method: 'PATCH',
        body: {
          status,
          reason: `Changed to ${status} from Customer 360`,
        },
      });
      await Promise.all([load(), loadDetail(selected.customerId)]);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const availableWalletCurrencies = currencies.filter(
    (item) => !detail?.wallets.some(
      (wallet) => wallet.currency === item && wallet.walletCode === 103,
    ),
  );
  const selectedWalletType = customerWalletTypes.find(
    (item) => String(item.walletCode) === customerForm.walletCode,
  );

  return (
    <section className="module-workspace">
      <ModuleHeader eyebrow="CUSTOMER INTELLIGENCE / CUSTOMER 360" title="Customer management" copy="Profile, KYC, credit, multi-currency customer wallets, and bank-routing controls in one protected view." action={customerFormOpen ? 'Close customer form' : 'Add customer'} onAction={() => setCustomerFormOpen((open) => !open)} />
      <div className="workspace-toolbar">
        <label className="workspace-search"><Search /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search MSISDN prefix, name, or email" /></label>
        <span className="record-count">{formatInteger(total)} PROFILES · PAGE {page}/{pageCount}</span>
        <button onClick={() => void load()}>REFRESH</button>
      </div>
      {error && <OperationNotice tone="error" message={error} />}
      {notice && <OperationNotice tone="success" message={notice} />}
      {customerFormOpen && <div className="panel configuration-form customer-profile-editor">
        <PanelHead eyebrow="CUSTOMER ONBOARDING" title="Create customer and default wallet" />
        <label>MSISDN<input inputMode="numeric" placeholder="447700900123" value={customerForm.msisdn} onChange={(event) => setCustomerForm({ ...customerForm, msisdn: event.target.value.replace(/\D/g, '') })} /></label>
        <label>WALLET TYPE<select value={customerForm.walletCode} onChange={(event) => setCustomerForm({ ...customerForm, walletCode: event.target.value })}>{customerWalletTypes.map((item) => <option key={item.walletCode} value={item.walletCode}>{item.walletName} ({item.walletCode}) · KYC {item.kycRequired ? 'REQUIRED' : 'NOT REQUIRED'}</option>)}</select></label>
        <label>DEFAULT WALLET CURRENCY<select value={customerForm.defaultCurrency} onChange={(event) => setCustomerForm({ ...customerForm, defaultCurrency: event.target.value })}>{currencies.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>FIRST NAME<input value={customerForm.firstName} onChange={(event) => setCustomerForm({ ...customerForm, firstName: event.target.value })} /></label>
        <label>LAST NAME<input value={customerForm.lastName} onChange={(event) => setCustomerForm({ ...customerForm, lastName: event.target.value })} /></label>
        <label>EMAIL<input type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} /></label>
        <label>ADDRESS<input value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} /></label>
        {selectedWalletType?.kycRequired && <>
          <label>KYC DOCUMENT TYPE<select value={customerForm.documentType} onChange={(event) => setCustomerForm({ ...customerForm, documentType: event.target.value })}><option value="UGANDA_NATIONAL_ID">Uganda national ID</option><option value="PASSPORT">Passport</option></select><small>A linked draft KYC case is created automatically.</small></label>
          <label>ISSUING COUNTRY<input maxLength={3} value={customerForm.issuingCountry} onChange={(event) => setCustomerForm({ ...customerForm, issuingCountry: event.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} placeholder="UGA" /></label>
        </>}
        <label>IBAN (OPTIONAL)<input autoCapitalize="characters" placeholder="GB82 WEST 1234 5698 7654 32" value={customerForm.iban} onChange={(event) => setCustomerForm({ ...customerForm, iban: event.target.value.toUpperCase() })} /></label>
        <label>SWIFT / BIC (OPTIONAL)<input autoCapitalize="characters" placeholder="DEUTDEFF500" value={customerForm.swiftBic} onChange={(event) => setCustomerForm({ ...customerForm, swiftBic: event.target.value.toUpperCase() })} /></label>
        <button className="command-button" disabled={!customerForm.msisdn || !customerForm.firstName.trim() || !customerForm.defaultCurrency || !customerForm.walletCode} onClick={() => void createCustomer()}><Check /> START CUSTOMER ACCOUNT OPENING</button>
      </div>}
      <div className="panel operational-table">
        <table>
          <thead><tr><th>CUSTOMER</th><th>KYC / CATEGORY</th><th>SCORE</th><th>CREDIT LIMIT</th><th>WALLETS</th><th>STATUS</th></tr></thead>
          <tbody>
            {loading && <LoadingRow columns={6} />}
            {!loading && !customers.length && <EmptyRow columns={6} message="No customer profiles match this search." />}
            {!loading && customers.map((customer) => (
              <tr key={customer.customerId} onClick={() => openCustomer(customer)} className="clickable-row">
                <td><div className="primary-cell"><strong>{customer.name || 'Unnamed customer'}</strong><small>{customer.customerId} · {customer.email || 'No email'}</small></div></td>
                <td><span className="table-code">{customer.category || 'UNCLASSIFIED'}</span><small className="sub-value">KYC {kycStatusLabel(customer.kycStatus)}{customer.kycRequired && !customer.kycDataConnected ? ' · DATA REQUIRED' : ''}</small></td>
                <td className="numeric">{customer.creditScore ?? '—'}</td>
                <td className="numeric">{formatMoney(customer.creditLimit || 0, 'UGX')}<small className="sub-value">Available {formatMoney(customer.availableLimit || 0, 'UGX')}</small></td>
                <td>{customer.walletCount}<small className="sub-value">{formatWalletBalances(customer.walletBalances)}</small></td>
                <td><StatusPill value={customerStatus(customer.status)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="registry-pagination">
        <button disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowLeft /> PREVIOUS</button>
        <span>SHOWING {customers.length ? formatInteger((page - 1) * pageSize + 1) : '0'}–{formatInteger(Math.min(page * pageSize, total))} OF {formatInteger(total)}</span>
        <button disabled={page >= pageCount || loading} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>NEXT <ArrowRight /></button>
      </div>
      {selected && (
        <div className="record-drawer customer-360-drawer">
          <button className="drawer-scrim" onClick={() => setSelected(null)} aria-label="Close customer details" />
          <aside>
            <div className="drawer-head"><div><span>CUSTOMER 360 / {selected.customerId}</span><h2>{selected.name || selected.customerId}</h2></div><button className="icon-button" onClick={() => setSelected(null)}><X /></button></div>
            <div className="customer-360-summary">
              <div><span>STATUS</span><StatusPill value={customerStatus((detail?.profile || selected).status)} /></div>
              <div><span>CATEGORY</span><strong>{(detail?.profile || selected).category || 'UNCLASSIFIED'}</strong></div>
              <div><span>WALLETS</span><strong>{detail?.wallets.length ?? selected.walletCount}</strong></div>
              <div><span>WALLET BALANCES</span><strong>{formatWalletBalances((detail?.profile || selected).walletBalances)}</strong></div>
            </div>
            <div className="customer-360-tabs">
              {([
                ['overview', 'OVERVIEW'],
                ['profile', 'PROFILE & KYC'],
                ['wallets', 'CUSTOMER WALLETS'],
                ['credit', 'CREDIT'],
              ] as const).map(([id, label]) => (
                <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setEditing(false); }}>{label}</button>
              ))}
            </div>
            {detailLoading && <div className="customer-360-loading"><LoaderCircle className="spin" /> LOADING CUSTOMER DATA</div>}
            {!detailLoading && detail && tab === 'overview' && (
              <div className="drawer-grid">
                <DataPoint label="CUSTOMER ID" value={detail.profile.customerId} />
                <DataPoint label="EMAIL" value={detail.profile.email || 'Not provided'} />
                <DataPoint label="CREDIT SCORE" value={String(detail.profile.creditScore ?? '—')} />
                <DataPoint label="CURRENT DPD" value={String(detail.profile.currentDpd ?? 0)} />
                <DataPoint label="CREDIT LIMIT" value={formatMoney(detail.profile.creditLimit || 0, 'UGX')} />
                <DataPoint label="AVAILABLE LIMIT" value={formatMoney(detail.profile.availableLimit || 0, 'UGX')} />
                <DataPoint label="KYC STATUS" value={kycStatusLabel(detail.profile.kycStatus)} />
                <DataPoint label="ADDRESS" value={detail.profile.address || 'Not provided'} />
              </div>
            )}
            {!detailLoading && detail && tab === 'profile' && (
              <>
                {!editing ? (
                  <div className="drawer-grid">
                    <DataPoint label="FIRST NAME" value={detail.profile.firstName || '—'} />
                    <DataPoint label="LAST NAME" value={detail.profile.lastName || '—'} />
                    <DataPoint label="EMAIL" value={detail.profile.email || '—'} />
                    <DataPoint label="ADDRESS" value={detail.profile.address || '—'} />
                    <DataPoint label="KYC STATUS" value={kycStatusLabel(detail.profile.kycStatus)} />
                    <DataPoint label="LATEST KYC CASE" value={detail.latestKycCase?.status || 'NOT STARTED'} />
                    <DataPoint label="ID TYPE" value={detail.profile.idType?.replaceAll('_', ' ') || '—'} />
                    <DataPoint label="ID NUMBER" value={detail.profile.idNumber || '—'} />
                    <DataPoint label="DATE OF BIRTH" value={detail.profile.dob ? formatDate(detail.profile.dob) : '—'} />
                    <DataPoint label="GENDER" value={detail.profile.gender || '—'} />
                    <DataPoint label="VERIFIED CASE" value={detail.profile.kycCaseId || '—'} />
                    <DataPoint label="VERIFIED AT" value={detail.profile.kycVerifiedAt ? formatDate(detail.profile.kycVerifiedAt) : '—'} />
                    <DataPoint label="VERIFIED BY" value={detail.profile.kycVerifiedBy || '—'} />
                    <DataPoint label="KYC REQUIREMENT" value={detail.profile.kycRequired ? 'REQUIRED' : 'NOT REQUIRED'} />
                    <DataPoint label="KYC DATA LINK" value={detail.profile.kycDataConnected ? 'CONNECTED' : detail.profile.kycRequired ? 'REMEDIATION REQUIRED' : 'NOT APPLICABLE'} />
                    <DataPoint label="ACCOUNT OPENING" value={detail.accountOpening?.status || (detail.wallets.length ? 'OPENED' : 'NOT STARTED')} />
                    <DataPoint label="REQUESTED WALLET" value={detail.accountOpening ? `${detail.accountOpening.walletName || detail.accountOpening.walletCode} · ${detail.accountOpening.currency}` : '—'} />
                    <DataPoint label="PROFILE STATUS" value={customerStatus(detail.profile.status)} />
                  </div>
                ) : (
                  <div className="configuration-form customer-profile-editor">
                    <label>FIRST NAME<input value={profileForm.firstName} onChange={(event) => setProfileForm({ ...profileForm, firstName: event.target.value })} /></label>
                    <label>LAST NAME<input value={profileForm.lastName} onChange={(event) => setProfileForm({ ...profileForm, lastName: event.target.value })} /></label>
                    <label>EMAIL<input type="email" value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} /></label>
                    <label>ADDRESS<input value={profileForm.address} onChange={(event) => setProfileForm({ ...profileForm, address: event.target.value })} /></label>
                    <button className="command-button" onClick={() => void saveProfile()}><Check /> SAVE AUDITED PROFILE</button>
                  </div>
                )}
                <div className="drawer-actions">
                  <button className="outline-command" onClick={() => setEditing(!editing)}><Settings /> {editing ? 'CANCEL EDIT' : 'EDIT PROFILE'}</button>
                  <button className="outline-command" onClick={() => void changeStatus(detail.profile, 'ACTIVE')}><Check /> ACTIVATE</button>
                  <button className="outline-command danger" onClick={() => void changeStatus(detail.profile, 'SUSPENDED')}><ShieldAlert /> SUSPEND</button>
                  <button className="outline-command danger" onClick={() => void changeStatus(detail.profile, 'BLOCKED')}><LockKeyhole /> BLOCK</button>
                  {detail.accountOpening && detail.accountOpening.status !== 'OPENED' && (
                    <button className="command-button" onClick={() => void completeAccountOpening()}><ShieldCheck /> CHECK KYC & OPEN WALLET</button>
                  )}
                </div>
                <div className="customer-kyc-heading"><div><span>KYC HISTORY</span><strong>Customer-linked identity cases</strong></div><small>{detail.kycCases.length} CASE{detail.kycCases.length === 1 ? '' : 'S'} · LINKED BY MSISDN</small></div>
                {detail.latestKycCase?.extractedData && <div className="drawer-grid customer-kyc-extracted">
                  <DataPoint label="EXTRACTED NAME" value={String(detail.latestKycCase.extractedData.fullName || [detail.latestKycCase.extractedData.firstName, detail.latestKycCase.extractedData.lastName].filter(Boolean).join(' ') || '—')} />
                  <DataPoint label="EXTRACTED ID" value={String(detail.latestKycCase.extractedData.idNumber || '—')} />
                  <DataPoint label="EXTRACTED DOB" value={String(detail.latestKycCase.extractedData.dateOfBirth || '—')} />
                  <DataPoint label="SCREENING" value={String(detail.latestKycCase.screeningSummary?.status || 'NOT RUN')} />
                </div>}
                <div className="customer-360-table">
                  <table>
                    <thead><tr><th>CASE / DOCUMENT</th><th>STATUS</th><th>BIOMETRIC / AML</th><th>EVIDENCE</th><th>REVIEW</th></tr></thead>
                    <tbody>
                      {!detail.kycCases.length && <EmptyRow columns={5} message="No KYC case is linked to this customer." />}
                      {detail.kycCases.map((kycCase) => <tr key={kycCase.id}>
                        <td><div className="primary-cell"><strong>{kycCase.id}</strong><small>{kycCase.documentType?.replaceAll('_', ' ') || '—'} · {kycCase.issuingCountry || '—'}</small></div></td>
                        <td><StatusPill value={kycCase.status} /><small className="sub-value">{kycCase.systemRecommendation || 'NO SYSTEM DECISION'}</small></td>
                        <td><div className="primary-cell"><strong>{kycCase.faceMatchScore === null || kycCase.faceMatchScore === undefined ? 'PENDING' : `${Number(kycCase.faceMatchScore).toFixed(1)}% FACE`}</strong><small>AML {kycCase.amlMatch ? 'MATCH' : 'CLEAR / NONE'}</small></div></td>
                        <td>{kycCase.documentCount || 0}<small className="sub-value">{kycCase.documentRoles?.join(' · ') || 'NO DOCUMENTS'}</small></td>
                        <td><div className="primary-cell"><strong>{kycCase.reviewedBy || 'PENDING'}</strong><small>{kycCase.reviewedAt ? formatDate(kycCase.reviewedAt) : formatDate(kycCase.createdAt)}</small></div></td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {!detailLoading && detail && tab === 'wallets' && (
              <>
                <div className="drawer-actions">
                  {detail.accountOpening && detail.accountOpening.status !== 'OPENED' && (
                    <button className="command-button" onClick={() => void completeAccountOpening()}><ShieldCheck /> CHECK KYC & OPEN DEFAULT WALLET</button>
                  )}
                  <button className="outline-command" disabled={!availableWalletCurrencies.length} onClick={() => {
                    setWalletFormOpen((open) => !open);
                    setWalletForm((current) => ({ ...current, currency: availableWalletCurrencies[0] || '' }));
                    setRoutingWalletId('');
                  }}><Plus /> {availableWalletCurrencies.length ? 'ADD CURRENCY WALLET' : 'ALL CURRENCIES ADDED'}</button>
                </div>
                {walletFormOpen && <div className="configuration-form customer-profile-editor">
                  <label>CURRENCY<select value={walletForm.currency} onChange={(event) => setWalletForm({ ...walletForm, currency: event.target.value })}>
                    {availableWalletCurrencies.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select></label>
                  <label>OPENING BALANCE<input value="0.00" disabled /></label>
                  <label>IBAN (OPTIONAL)<input placeholder="GB82 WEST 1234 5698 7654 32" value={walletForm.iban} onChange={(event) => setWalletForm({ ...walletForm, iban: event.target.value.toUpperCase() })} /></label>
                  <label>SWIFT / BIC (OPTIONAL)<input placeholder="DEUTDEFF500" value={walletForm.swiftBic} onChange={(event) => setWalletForm({ ...walletForm, swiftBic: event.target.value.toUpperCase() })} /></label>
                  <button className="command-button" disabled={!walletForm.currency} onClick={() => void addCurrencyWallet()}><Check /> CREATE ZERO-BALANCE WALLET</button>
                </div>}
                {routingWalletId && <div className="configuration-form customer-profile-editor">
                  <label>IBAN<input placeholder="Leave blank to clear" value={routingForm.iban} onChange={(event) => setRoutingForm({ ...routingForm, iban: event.target.value.toUpperCase() })} /></label>
                  <label>SWIFT / BIC<input placeholder="Leave blank to clear" value={routingForm.swiftBic} onChange={(event) => setRoutingForm({ ...routingForm, swiftBic: event.target.value.toUpperCase() })} /></label>
                  <button className="command-button" onClick={() => void saveRouting()}><Check /> SAVE ROUTING DETAILS</button>
                  <button className="outline-command" onClick={() => setRoutingWalletId('')}>CANCEL</button>
                </div>}
                <div className="customer-360-table">
                  <table>
                    <thead><tr><th>WALLET / CURRENCY</th><th>ROUTING</th><th>BALANCE</th><th>STATE</th><th>CONTROL</th></tr></thead>
                    <tbody>
                      {!detail.wallets.length && <EmptyRow columns={5} message="This customer has no wallets." />}
                      {detail.wallets.map((wallet) => (
                        <tr key={wallet.walletId}>
                          <td><div className="primary-cell"><strong>{wallet.walletId}</strong><small>{wallet.currency} · {wallet.isDefault ? 'DEFAULT CURRENCY' : wallet.purpose} · {wallet.walletName || wallet.walletCode}</small></div></td>
                          <td><div className="primary-cell"><strong>{wallet.iban || 'NO IBAN'}</strong><small>SWIFT/BIC {wallet.swiftBic || '—'} · Internal {wallet.accountCode || '—'}</small></div></td>
                          <td className="numeric">{formatMoney(wallet.balance, wallet.currency)}</td>
                          <td><StatusPill value={walletStatus(wallet.status)} /></td>
                          <td><div className="row-actions">
                            {!wallet.isDefault && <button onClick={() => void setDefaultWallet(wallet)}>MAKE DEFAULT</button>}
                            <button onClick={() => { setRoutingWalletId(wallet.walletId); setRoutingForm({ iban: wallet.iban || '', swiftBic: wallet.swiftBic || '' }); setWalletFormOpen(false); }}>IBAN / SWIFT</button>
                            <button onClick={() => void setWalletStatus(wallet, 'ACTIVE')}>ACTIVATE</button>
                            <button onClick={() => void setWalletStatus(wallet, 'FROZEN')}>FREEZE</button>
                            <button onClick={() => void setWalletStatus(wallet, 'SUSPENDED')}>SUSPEND</button>
                          </div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {!detailLoading && detail && tab === 'credit' && (
              <div className="customer-360-table">
                <table>
                  <thead><tr><th>DECISION</th><th>PRODUCT</th><th>OUTCOME</th><th>LIMIT</th><th>DATE</th></tr></thead>
                  <tbody>
                    {!detail.decisions.length && <EmptyRow columns={5} message="No credit decisions have been recorded." />}
                    {detail.decisions.map((decision) => (
                      <tr key={decision.id}>
                        <td><div className="primary-cell"><strong>{decision.applicationId || decision.id}</strong><small>{decision.reasonCode || 'No reason code'}</small></div></td>
                        <td>{decision.productId || '—'}</td>
                        <td><StatusPill value={decision.outcome || 'UNKNOWN'} /></td>
                        <td className="numeric">{formatMoney(decision.finalLimit || 0, 'UGX')}</td>
                        <td>{formatDate(decision.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

function TransactionsWorkspace({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<TransactionRow | null>(null);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState<'overview' | 'accounting' | 'aml'>('overview');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminRequest<{ data: TransactionRow[]; totalRecords: number }>(
        `/admin/operations/transactions?page=${page}&limit=${pageSize}&search=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}`,
        token,
      );
      setTransactions(result.data || []);
      setTotal(Number(result.totalRecords || 0));
    } catch (requestError) {
      const message = (requestError as Error).message;
      setError(message);
      if (/unauthorized|token|401/i.test(message)) onExpired();
    } finally {
      setLoading(false);
    }
  }, [onExpired, page, query, status, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openTransaction = (transaction: TransactionRow) => {
    setSelected(transaction);
    setDetail(null);
    setDetailLoading(true);
    setTab('overview');
    void adminRequest<TransactionDetail>(
      `/admin/operations/transactions/${transaction.transactionId}`,
      token,
    )
      .then((result) => {
        setDetail(result);
        setSelected(result.transaction);
      })
      .catch((requestError) => setError((requestError as Error).message))
      .finally(() => setDetailLoading(false));
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const completedVisible = transactions.filter((row) => row.status === 'COMPLETED').length;

  return (
    <section className="module-workspace">
      <ModuleHeader
        eyebrow="MONEY MOVEMENT / LIVE REGISTRY"
        title="Transactions"
        copy="Search and inspect the authoritative transaction request, accounting, AML, and dispute records. Results are loaded from the server in bounded pages."
        action="Refresh registry"
        onAction={() => void load()}
      />
      <div className="module-metrics transaction-metrics">
        <MiniMetric label="TOTAL TRANSACTIONS" value={formatInteger(total)} />
        <MiniMetric label="VISIBLE ON PAGE" value={formatInteger(transactions.length)} />
        <MiniMetric label="COMPLETED ON PAGE" value={formatInteger(completedVisible)} />
      </div>
      <div className="workspace-toolbar transaction-toolbar">
        <label className="workspace-search"><Search /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search transaction, wallet, TRNID, or reference" /></label>
        <label className="transaction-filter">
          <SlidersHorizontal />
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">ALL STATES</option>
            <option value="1">INITIATED</option>
            <option value="2">SUBMITTED</option>
            <option value="3">FAILED</option>
            <option value="4">RESERVED</option>
            <option value="5">COMPLETED</option>
            <option value="6">REVERSED</option>
          </select>
        </label>
        <span className="record-count">{formatInteger(total)} RECORDS · PAGE {page}/{pageCount}</span>
      </div>
      {error && <OperationNotice tone="error" message={error} />}
      <div className="panel operational-table transaction-table">
        <table>
          <thead><tr><th>TRANSACTION</th><th>FLOW</th><th>KEYWORD / REFERENCE</th><th>AMOUNT</th><th>STATE</th><th>DATE</th></tr></thead>
          <tbody>
            {loading && <LoadingRow columns={6} />}
            {!loading && !transactions.length && <EmptyRow columns={6} message="No transactions match the selected filters." />}
            {!loading && transactions.map((transaction) => (
              <tr key={transaction.transactionId} className="clickable-row" onClick={() => openTransaction(transaction)}>
                <td><div className="primary-cell"><strong>{transaction.transactionCode || transaction.transactionId}</strong><small>{transaction.transactionId}</small></div></td>
                <td><div className="transaction-flow"><span>{transaction.sourceWalletId}</span><ArrowRight /><span>{transaction.destinationWalletId}</span></div></td>
                <td><span className="table-code">{transaction.keyword || 'UNSPECIFIED'}</span><small className="sub-value">{transaction.reference || 'No reference'}</small></td>
                <td className="numeric">{formatMoney(transaction.amount, transaction.currency)}<small className="sub-value">Fee {formatMoney(transaction.fee || 0, transaction.currency)}</small></td>
                <td><StatusPill value={transaction.status} /><small className="sub-value">{transaction.journalStatus ? `Journal ${transaction.journalStatus}` : 'No journal'}</small></td>
                <td>{formatDate(transaction.transactionDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="registry-pagination">
        <button disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowLeft /> PREVIOUS</button>
        <span>SHOWING {transactions.length ? formatInteger((page - 1) * pageSize + 1) : '0'}–{formatInteger(Math.min(page * pageSize, total))} OF {formatInteger(total)}</span>
        <button disabled={page >= pageCount || loading} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>NEXT <ArrowRight /></button>
      </div>
      {selected && (
        <div className="record-drawer transaction-inspector-drawer">
          <button className="drawer-scrim" onClick={() => setSelected(null)} aria-label="Close transaction details" />
          <aside>
            <div className="drawer-head"><div><span>TRANSACTION INSPECTOR / {selected.transactionId}</span><h2>{selected.transactionCode || selected.keyword || selected.transactionId}</h2></div><button className="icon-button" onClick={() => setSelected(null)}><X /></button></div>
            <div className="customer-360-summary">
              <div><span>STATE</span><StatusPill value={(detail?.transaction || selected).status} /></div>
              <div><span>AMOUNT</span><strong>{formatMoney((detail?.transaction || selected).amount, (detail?.transaction || selected).currency)}</strong></div>
              <div><span>ACCOUNTING</span><strong>{detail?.journals.length ? `${detail.journals.length} JOURNAL` : selected.journalStatus || 'NOT POSTED'}</strong></div>
              <div><span>AML</span><strong>{detail?.aml ? String(detail.aml.status || 'RECORDED') : selected.amlStatus || 'NO RESERVATION'}</strong></div>
            </div>
            <div className="customer-360-tabs">
              <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>OVERVIEW</button>
              <button className={tab === 'accounting' ? 'active' : ''} onClick={() => setTab('accounting')}>ACCOUNTING</button>
              <button className={tab === 'aml' ? 'active' : ''} onClick={() => setTab('aml')}>AML & DISPUTES</button>
            </div>
            {detailLoading && <div className="customer-360-loading"><LoaderCircle className="spin" /> LOADING TRANSACTION DATA</div>}
            {!detailLoading && detail && tab === 'overview' && (
              <>
                {detail.refund && (
                  <div className="transaction-relationship">
                    <span>MERCHANT REFUND CHAIN</span>
                    <strong>{String(detail.refund.originalTransactionId)} → {String(detail.refund.refundTransactionId)}</strong>
                    <small>{String(detail.refund.refundReference)} · {String(detail.refund.status)}</small>
                  </div>
                )}
                <div className="drawer-grid">
                  <DataPoint label="TRANSACTION ID" value={detail.transaction.transactionId} />
                  <DataPoint label="TRNID" value={detail.transaction.transactionCode || '—'} />
                  <DataPoint label="SOURCE WALLET" value={detail.transaction.sourceWalletId} />
                  <DataPoint label="DESTINATION WALLET" value={detail.transaction.destinationWalletId} />
                  <DataPoint label="KEYWORD" value={detail.transaction.keyword || '—'} />
                  <DataPoint label="REFERENCE" value={detail.transaction.reference || '—'} />
                  <DataPoint label="FEE" value={formatMoney(detail.transaction.fee || 0, detail.transaction.currency)} />
                  <DataPoint label="COMMISSION" value={formatMoney(detail.transaction.commission || 0, detail.transaction.currency)} />
                  <DataPoint label="FEE PAYER" value={detail.transaction.feePayer || '—'} />
                  <DataPoint label="COMMISSION RECEIVER" value={detail.transaction.commissionReceiver || '—'} />
                  <DataPoint label="TRANSACTION DATE" value={formatDate(detail.transaction.transactionDate)} />
                  <DataPoint label="CREATED" value={formatDate(detail.transaction.createdAt)} />
                </div>
                {detail.transaction.remarks && <div className="transaction-remarks"><span>REMARKS</span><p>{detail.transaction.remarks}</p></div>}
                <TransactionDetailTable
                  columns={['LEG', 'ACTION', 'TYPE', 'AMOUNT', 'STATUS']}
                  rows={detail.details.map((row) => [
                    String(row.leg ?? '—'),
                    String(row.action ?? '—'),
                    String(row.type ?? '—'),
                    formatMoney(String(row.amount ?? 0), detail.transaction.currency),
                    String(row.status ?? '—'),
                  ])}
                  empty="No legacy transaction detail legs were recorded."
                />
              </>
            )}
            {!detailLoading && detail && tab === 'accounting' && (
              <>
                <TransactionDetailTable
                  columns={['JOURNAL', 'MODE', 'ACTION / LEG', 'STATUS', 'CREATED']}
                  rows={detail.journals.map((row) => [
                    String(row.id ?? '—'),
                    String(row.mode ?? '—'),
                    `${String(row.action ?? '—')} / ${String(row.leg ?? '—')}`,
                    String(row.status ?? '—'),
                    formatDate(row.createdAt),
                  ])}
                  empty="No accounting journal exists for this transaction."
                />
                <TransactionDetailTable
                  columns={['LINE', 'ACCOUNT', 'DEBIT', 'CREDIT', 'BALANCE AFTER']}
                  rows={detail.entries.map((row) => [
                    String(row.lineNumber ?? '—'),
                    String(row.accountCode ?? row.accountNumber ?? '—'),
                    formatMoney(String(row.debit ?? 0), String(row.currency || detail.transaction.currency)),
                    formatMoney(String(row.credit ?? 0), String(row.currency || detail.transaction.currency)),
                    formatMoney(String(row.balanceAfter ?? 0), String(row.currency || detail.transaction.currency)),
                  ])}
                  empty="No accounting entries exist for this transaction."
                />
              </>
            )}
            {!detailLoading && detail && tab === 'aml' && (
              <>
                {detail.aml ? (
                  <div className="drawer-grid">
                    <DataPoint label="WALLET" value={String(detail.aml.walletId || '—')} />
                    <DataPoint label="WALLET CODE" value={String(detail.aml.walletCode ?? '—')} />
                    <DataPoint label="KEYWORD" value={String(detail.aml.keyword || '—')} />
                    <DataPoint label="AMOUNT RESERVED" value={formatMoney(String(detail.aml.amount ?? 0), detail.transaction.currency)} />
                    <DataPoint label="AML STATE" value={String(detail.aml.status || '—')} />
                    <DataPoint label="RESERVED AT" value={formatDate(detail.aml.reservedAt)} />
                    <DataPoint label="FINALIZED AT" value={formatDate(detail.aml.finalizedAt)} />
                    <DataPoint label="LAST ERROR" value={String(detail.aml.lastError || 'None')} />
                  </div>
                ) : <div className="customer-360-loading">NO AML RESERVATION WAS RECORDED</div>}
                <TransactionDetailTable
                  columns={['DISPUTE', 'REASON', 'STATUS', 'REQUESTED BY', 'CREATED']}
                  rows={detail.disputes.map((row) => [
                    String(row.reference ?? row.id ?? '—'),
                    String(row.reason ?? '—'),
                    String(row.status ?? '—'),
                    String(row.requestedBy ?? '—'),
                    formatDate(row.createdAt),
                  ])}
                  empty="No disputes are linked to this transaction."
                />
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

function TransactionDetailTable({ columns, rows, empty }: { columns: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="customer-360-table transaction-detail-table">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {!rows.length && <EmptyRow columns={columns.length} message={empty} />}
          {rows.map((row, rowIndex) => <tr key={`${row[0]}-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${columns[cellIndex]}-${cellIndex}`}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function CreditWorkspace({ token }: { token: string }) {
  const [masters, setMasters] = useState<CreditMaster[]>([]);
  const [rules, setRules] = useState<Array<Record<string, unknown>>>([]);
  const [executions, setExecutions] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState('');
  const [simulation, setSimulation] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [simulationResult, setSimulationResult] = useState<Record<string, unknown> | null>(null);
  const [editor, setEditor] = useState<'master' | 'rule' | null>(null);
  const [masterForm, setMasterForm] = useState({ code: '', name: '', category: 'PRIME', productId: '', currency: 'UGX', maximumLimit: '' });
  const [ruleForm, setRuleForm] = useState({ name: '', priority: '10', sourceType: 'POSTGRES', tableName: 'credit_scored_customers', lookupColumn: 'msisdn', valueColumn: 'credit_score', aiResultField: 'score', operator: 'GREATER_THAN_OR_EQUAL', threshold: '600', limit: '100000' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [masterResult, executionResult] = await Promise.all([
        adminRequest<{ data: CreditMaster[] }>('/admin/operations/credit/v1/credit-rule-masters?limit=100', token),
        adminRequest<{ data?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> }>('/admin/operations/credit/v1/credit-rule-executions?limit=20', token),
      ]);
      setMasters(masterResult.data || []);
      setExecutions(executionResult.data || executionResult.items || []);
      setSelectedId((current) => current || masterResult.data?.[0]?.id || '');
      setMessage('');
    } catch (requestError) {
      setMessage((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = masters.find((master) => master.id === selectedId);
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => {
      void adminRequest<Array<Record<string, unknown>>>(`/admin/operations/credit/v1/credit-rule-masters/${selectedId}/rules`, token)
        .then(setRules)
        .catch((requestError) => setMessage((requestError as Error).message));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedId, token]);
  const transition = async (action: 'submit' | 'approve' | 'activate' | 'retire') => {
    if (!selected) return;
    try {
      await adminRequest(`/admin/operations/credit/v1/credit-rule-masters/${selected.id}/${action}`, token, {
        method: 'POST',
        body: action === 'submit' || action === 'approve' ? { comment: `${action} from Finify Command` } : {},
      });
      setMessage(`Policy ${selected.ruleCode} ${action} completed.`);
      await load();
    } catch (requestError) { setMessage((requestError as Error).message); }
  };
  const simulate = async () => {
    if (!selected) return;
    setSimulation(true);
    setSimulationResult(null);
    try {
      const result = await adminRequest<Record<string, unknown>>(
        `/admin/operations/credit/v1/credit-rule-masters/${selected.id}/simulate`,
        token,
        {
          method: 'POST',
          body: {
            customerId: '256700000001',
            productId: selected.productId,
            currency: selected.currency || 'UGX',
            requestedAmount: 100000,
            existingExposure: 0,
            pendingReservations: 0,
          },
        },
      );
      setSimulationResult(result);
    } catch (requestError) { setMessage((requestError as Error).message); }
    finally { setSimulation(false); }
  };
  const createMaster = async () => {
    try {
      const created = await adminRequest<CreditMaster>('/admin/operations/credit/v1/credit-rule-masters', token, {
        method: 'POST',
        body: {
          ruleCode: masterForm.code,
          name: masterForm.name,
          customerCategory: masterForm.category,
          productId: masterForm.productId,
          currency: masterForm.currency,
          baseLimit: 0,
          minimumLimit: 0,
          maximumLimit: Number(masterForm.maximumLimit),
          defaultOutcome: 'REJECTED',
          autoApprovalEnabled: false,
          defaultRepaymentOptionIds: [],
        },
      });
      setEditor(null);
      setMessage(`Policy ${created.ruleCode || masterForm.code} created as a draft.`);
      await load();
      if (created.id) setSelectedId(created.id);
    } catch (requestError) { setMessage((requestError as Error).message); }
  };
  const createRule = async () => {
    if (!selected) return;
    const postgres = ruleForm.sourceType === 'POSTGRES';
    const ai = ruleForm.sourceType === 'AI_RESULT';
    try {
      await adminRequest(`/admin/operations/credit/v1/credit-rule-masters/${selected.id}/rules`, token, {
        method: 'POST',
        body: {
          name: ruleForm.name,
          priority: Number(ruleForm.priority),
          sourceType: ruleForm.sourceType,
          ...(postgres ? { schemaName: 'public', tableName: ruleForm.tableName, lookupColumn: ruleForm.lookupColumn, valueColumn: ruleForm.valueColumn, readMode: 'SINGLE' } : {}),
          ...(ai ? { aiResultField: ruleForm.aiResultField } : {}),
          dataType: 'DECIMAL',
          condition: { operator: ruleForm.operator, value: Number(ruleForm.threshold) },
          actionOnMatch: { type: 'SET_CREDIT_OFFER', limit: Number(ruleForm.limit), repaymentOptionIds: ['EMI_3', 'EMI_6'] },
          actionOnNoMatch: { type: 'CONTINUE' },
          sourceFailureAction: { type: 'MANUAL_REVIEW', reasonCode: 'DATA_SOURCE_UNAVAILABLE' },
          stopOnMatch: false,
          stopOnNoMatch: false,
        },
      });
      setEditor(null);
      setMessage(`Rule added to ${selected.ruleCode}.`);
      const nextRules = await adminRequest<Array<Record<string, unknown>>>(`/admin/operations/credit/v1/credit-rule-masters/${selected.id}/rules`, token);
      setRules(nextRules);
    } catch (requestError) { setMessage((requestError as Error).message); }
  };

  return (
    <section className="module-workspace">
      <ModuleHeader eyebrow="CREDIT / POLICY CONTROL" title="Decision engine" copy="Create rule masters, add dynamic data rules, submit, approve, activate, simulate, and trace customer credit policies." action="New master policy" onAction={() => setEditor('master')} />
      {message && <OperationNotice tone={/completed/i.test(message) ? 'success' : 'error'} message={message} />}
      <div className="policy-strip">
        <label>MASTER POLICY<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{masters.map((master) => <option value={master.id} key={master.id}>{master.ruleCode} v{master.version} · {master.status}</option>)}</select></label>
        <div className="row-actions">
          <button disabled={!selected || loading} onClick={() => void transition('submit')}>SUBMIT</button>
          <button disabled={!selected || loading} onClick={() => void transition('approve')}>APPROVE</button>
          <button disabled={!selected || loading} onClick={() => void transition('activate')}>ACTIVATE</button>
          <button disabled={!selected || simulation} onClick={() => void simulate()}>{simulation ? 'SIMULATING…' : 'SIMULATE'}</button>
        </div>
      </div>
      <div className="credit-workspace-grid">
        <div className="panel rule-canvas">
          <div className="canvas-toolbar">
            <div><span className="status-dot" /> {selected?.ruleCode || 'NO POLICY'} <small>VERSION {selected?.version || '—'} / {selected?.status || 'UNAVAILABLE'}</small></div>
            <div><button><Zap /> AUTO LAYOUT</button><button onClick={() => void simulate()} className={simulation ? 'active' : ''}><Gauge /> {simulation ? 'SIMULATING' : 'SIMULATE'}</button></div>
          </div>
          <div className={`rule-flow ${simulation ? 'simulating' : ''}`}>
            {!rules.length && <div className="empty-rule-flow"><Workflow /><strong>No rules in this draft</strong><span>Add the first AI, database, or HTTP rule.</span><button onClick={() => setEditor('rule')}>ADD RULE</button></div>}
            {rules.map((rule, index) => <div key={String(rule.id)} className="rule-sequence"><RuleNode index={String(index + 1).padStart(2, '0')} source={String(rule.sourceType || 'SOURCE').replace('_', ' ')} title={String(rule.name)} condition={conditionSummary(rule.condition)} result={actionSummary(rule.actionOnMatch)} accent={index === rules.length - 1} />{index < rules.length - 1 && <span className="rule-line"><i /></span>}</div>)}
          </div>
        </div>
        <div className="panel inspector-panel">
          <PanelHead eyebrow="POLICY INSPECTOR" title="Execution contract" />
          <div className="inspector-section"><span>MASTER SELECTION</span><strong>{selected ? `${selected.customerCategory} + ${selected.productId}` : 'Unavailable'}</strong></div>
          <div className="inspector-section"><span>DATA TABLE</span><strong>credit_scored_customers</strong></div>
          <div className="inspector-section"><span>FAILURE BEHAVIOUR</span><strong>Manual review / fail closed</strong></div>
          <div className="inspector-section"><span>APPROVAL</span><strong>Maker-checker enforced</strong></div>
          <div className="inspector-section"><span>LAST SIMULATION</span><strong>{simulationResult ? String(simulationResult.outcome || simulationResult.status || 'COMPLETED') : 'Not run'}</strong></div>
          <div className="inspector-actions"><button className="outline-command" onClick={() => setEditor('rule')}><Workflow /> ADD RULE</button><button className="outline-command" onClick={() => setSimulationResult(simulationResult ? null : { policies: masters.length, rules: rules.length, executions: executions.length })}><Eye /> JSON PREVIEW</button><button className="command-button small" onClick={() => void transition('submit')}><ShieldCheck /> SUBMIT REVIEW</button></div>
          {simulationResult && <pre className="json-preview">{JSON.stringify(simulationResult, null, 2)}</pre>}
        </div>
      </div>
      {editor && <div className="record-drawer">
        <button className="drawer-scrim" onClick={() => setEditor(null)} aria-label="Close credit editor" />
        <aside>
          <div className="drawer-head"><div><span>CREDIT POLICY MAKER</span><h2>{editor === 'master' ? 'New master policy' : `Add rule to ${selected?.ruleCode || 'policy'}`}</h2></div><button className="icon-button" onClick={() => setEditor(null)}><X /></button></div>
          {editor === 'master' ? <div className="configuration-form">
            <label>RULE CODE<input value={masterForm.code} onChange={(event) => setMasterForm({ ...masterForm, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} /></label>
            <label>POLICY NAME<input value={masterForm.name} onChange={(event) => setMasterForm({ ...masterForm, name: event.target.value })} /></label>
            <label>CUSTOMER CATEGORY<input value={masterForm.category} onChange={(event) => setMasterForm({ ...masterForm, category: event.target.value.toUpperCase() })} /></label>
            <label>PRODUCT ID<input value={masterForm.productId} onChange={(event) => setMasterForm({ ...masterForm, productId: event.target.value })} /></label>
            <label>CURRENCY<input maxLength={3} value={masterForm.currency} onChange={(event) => setMasterForm({ ...masterForm, currency: event.target.value.toUpperCase() })} /></label>
            <label>MAXIMUM LIMIT<input inputMode="decimal" value={masterForm.maximumLimit} onChange={(event) => setMasterForm({ ...masterForm, maximumLimit: event.target.value })} /></label>
            <button className="command-button" onClick={() => void createMaster()}><Check /> CREATE DRAFT POLICY</button>
          </div> : <div className="configuration-form">
            <label>RULE NAME<input value={ruleForm.name} onChange={(event) => setRuleForm({ ...ruleForm, name: event.target.value })} /></label>
            <label>PRIORITY<input inputMode="numeric" value={ruleForm.priority} onChange={(event) => setRuleForm({ ...ruleForm, priority: event.target.value.replace(/\D/g, '') })} /></label>
            <label>DATA SOURCE<select value={ruleForm.sourceType} onChange={(event) => setRuleForm({ ...ruleForm, sourceType: event.target.value })}><option value="AI_RESULT">AI result</option><option value="POSTGRES">Database table</option></select></label>
            {ruleForm.sourceType === 'AI_RESULT' ? <label>AI RESULT FIELD<input value={ruleForm.aiResultField} onChange={(event) => setRuleForm({ ...ruleForm, aiResultField: event.target.value })} /></label> : <>
              <label>TABLE NAME<input value={ruleForm.tableName} onChange={(event) => setRuleForm({ ...ruleForm, tableName: event.target.value })} /></label>
              <label>LOOKUP COLUMN<input value={ruleForm.lookupColumn} onChange={(event) => setRuleForm({ ...ruleForm, lookupColumn: event.target.value })} /></label>
              <label>VALUE COLUMN<input value={ruleForm.valueColumn} onChange={(event) => setRuleForm({ ...ruleForm, valueColumn: event.target.value })} /></label>
            </>}
            <label>OPERATOR<select value={ruleForm.operator} onChange={(event) => setRuleForm({ ...ruleForm, operator: event.target.value })}><option value="GREATER_THAN">Greater than</option><option value="GREATER_THAN_OR_EQUAL">Greater or equal</option><option value="LESS_THAN">Less than</option><option value="LESS_THAN_OR_EQUAL">Less or equal</option><option value="EQUALS">Equals</option></select></label>
            <label>THRESHOLD<input inputMode="decimal" value={ruleForm.threshold} onChange={(event) => setRuleForm({ ...ruleForm, threshold: event.target.value })} /></label>
            <label>OFFER LIMIT ON MATCH<input inputMode="decimal" value={ruleForm.limit} onChange={(event) => setRuleForm({ ...ruleForm, limit: event.target.value })} /></label>
            <button className="command-button" onClick={() => void createRule()}><Check /> ADD RULE TO DRAFT</button>
          </div>}
        </aside>
      </div>}
    </section>
  );
}

function AmlWorkspace({ token, profile }: { token: string; profile: AdminProfile }) {
  const [configs, setConfigs] = useState<AmlConfiguration[]>([]);
  const [activity, setActivity] = useState<Array<Record<string, unknown>>>([]);
  const [cases, setCases] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      const [configResult, activityResult, caseResult] = await Promise.all([
        adminRequest<{ data: Array<Record<string, unknown>> }>('/admin/reference-data/aml-configurations?limit=100', token),
        adminRequest<{ data: Array<Record<string, unknown>> }>('/admin/operations/aml/activity?limit=100', token),
        adminRequest<Array<Record<string, unknown>>>('/admin/operations/aml/cases?limit=100', token),
      ]);
      setConfigs(configResult.data || []);
      setActivity(activityResult.data || []);
      setCases(Array.isArray(caseResult) ? caseResult : []);
      setMessage('');
    } catch (requestError) { setMessage((requestError as Error).message); }
  }, [token]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const request: AmlAdminRequest = useCallback(
    async <T,>(route: string, init?: { method?: string; body?: unknown }): Promise<T> =>
      adminRequest<T>(route, token, init),
    [token],
  );
  const createCase = async (row: Record<string, unknown>) => {
    try {
      await adminRequest('/admin/operations/aml/cases', token, {
        method: 'POST',
        body: {
          reservationId: row.id,
          sourceWallet: row.sourceWallet,
          reasonCode: `AML_${String(row.status || 'REVIEW')}`,
          summary: `Review AML reservation for transaction ${String(row.transactionId)}`,
          riskLevel: Number(row.amount || 0) >= 1000000 ? 'HIGH' : 'MEDIUM',
        },
      });
      setMessage(`AML case opened for transaction ${String(row.transactionId)}.`);
      await load();
    } catch (requestError) { setMessage((requestError as Error).message); }
  };
  const decideCase = async (row: Record<string, unknown>, status: 'IN_REVIEW' | 'CLEARED' | 'ESCALATED') => {
    try {
      await adminRequest(`/admin/operations/aml/cases/${String(row.id)}`, token, {
        method: 'PATCH',
        body: { status, resolution: status === 'CLEARED' ? 'Cleared through Finify Command review' : undefined },
      });
      setMessage(`AML case ${String(row.id)} moved to ${status}.`);
      await load();
    } catch (requestError) { setMessage((requestError as Error).message); }
  };
  return (
    <section className="module-workspace">
      <ModuleHeader eyebrow="RISK CONTROL / AML" title="AML operations" copy="Monitor transaction-limit reservations, AML configurations, exceptions, and linked investigation cases." action="Refresh risk signals" onAction={() => void load()} />
      {message && <OperationNotice tone="error" message={message} />}
      <div className="module-metrics">
        <MiniMetric label="AML PROFILES" value={String(configs.length)} />
        <MiniMetric label="RECENT RESERVATIONS" value={String(activity.length)} />
        <MiniMetric label="OPEN CASES" value={String(cases.filter((row) => !['CLEARED', 'CLOSED'].includes(String(row.status))).length)} />
      </div>
      <AmlConfigurationBuilder
        request={request}
        profile={profile}
        configurations={configs}
        onSubmitted={load}
      />
      <div className="dual-operations">
        <div className="panel operational-table">
          <PanelHead eyebrow="CONTROL LIMITS" title="AML configurations" />
          <table><thead><tr><th>WALLET / KEYWORD</th><th>PER TXN</th><th>DAILY</th><th>MONTHLY</th><th>STATE</th></tr></thead><tbody>
            {!configs.length && <EmptyRow columns={5} message="No AML configurations found." />}
            {configs.slice(0, 20).map((row, index) => <tr key={`${String(row.walletCode ?? index)}:${String(row.keyword ?? index)}`}><td><div className="primary-cell"><strong>{String(row.walletName ?? row.walletCode ?? '—')} / {String(row.keyword ?? '—')}</strong><small>{String(row.keywordDescription ?? `Wallet ${String(row.walletCode ?? '—')}`)}</small></div></td><td className="numeric">{String(row.maxTransactionAmount ?? '—')}</td><td className="numeric">{String(row.dailyMaxAmount ?? '—')} / {String(row.dailyTransactionCount ?? '—')} txns</td><td className="numeric">{String(row.monthlyMaxAmount ?? '—')} / {String(row.monthlyTransactionCount ?? '—')} txns</td><td><StatusPill value={row.pendingRequestId ? `PENDING ${String(row.pendingAction || 'CHANGE')}` : 'ACTIVE'} /></td></tr>)}
          </tbody></table>
        </div>
        <div className="panel operational-table">
          <PanelHead eyebrow="LIVE MONITORING" title="AML transaction activity" />
          <table><thead><tr><th>TRANSACTION</th><th>WALLET</th><th>AMOUNT</th><th>STATUS</th><th>CASE</th></tr></thead><tbody>
            {!activity.length && <EmptyRow columns={5} message="No AML activity recorded." />}
            {activity.slice(0, 20).map((row, index) => <tr key={String(row.id ?? index)}><td><div className="primary-cell"><strong>{String(row.transactionId ?? '—')}</strong><small>{String(row.keyword ?? '')}</small></div></td><td>{String(row.sourceWallet ?? '—')}</td><td className="numeric">{String(row.amount ?? '—')}</td><td><StatusPill value={String(row.status ?? 'UNKNOWN')} /></td><td>{row.caseId ? <span className="table-code">#{String(row.caseId)}</span> : <div className="row-actions"><button onClick={() => void createCase(row)}>OPEN CASE</button></div>}</td></tr>)}
          </tbody></table>
        </div>
      </div>
      <div className="panel operational-table">
        <PanelHead eyebrow="INVESTIGATION QUEUE" title="AML cases" />
        <table><thead><tr><th>CASE</th><th>RISK</th><th>REASON</th><th>WALLET</th><th>STATUS</th><th>DECISION</th></tr></thead><tbody>
          {!cases.length && <EmptyRow columns={6} message="No AML investigation cases are open." />}
          {cases.map((row) => <tr key={String(row.id)}><td><span className="table-code">#{String(row.id)}</span></td><td><StatusPill value={String(row.riskLevel)} /></td><td><div className="primary-cell"><strong>{String(row.reasonCode)}</strong><small>{String(row.summary)}</small></div></td><td>{String(row.sourceWallet ?? '—')}</td><td><StatusPill value={String(row.status)} /></td><td><div className="row-actions"><button onClick={() => void decideCase(row, 'IN_REVIEW')}>REVIEW</button><button onClick={() => void decideCase(row, 'CLEARED')}>CLEAR</button><button onClick={() => void decideCase(row, 'ESCALATED')}>ESCALATE</button></div></td></tr>)}
        </tbody></table>
      </div>
    </section>
  );
}

function AccountingWorkspace({ token, profile }: { token: string; profile: AdminProfile }) {
  type AccountingView = 'control' | 'currencies' | 'journal' | 'ledger' | 'balance-sheet' | 'profit-loss';
  type PagedReport = {
    data: Array<Record<string, unknown>>;
    accounts?: Array<Record<string, unknown>>;
    totals?: Record<string, unknown>;
    currencyTotals?: Array<Record<string, unknown>>;
    totalRecords: number;
    page: number;
    totalPages: number;
  };
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [eodSchedule, setEodSchedule] = useState<Record<string, unknown> | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleRunning, setScheduleRunning] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ enabled: true, businessTimezone: 'Europe/London', closureTime: '00:05:00' });
  const [view, setView] = useState<AccountingView>('control');
  const [message, setMessage] = useState('');
  const [businessDate, setBusinessDate] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [currency, setCurrency] = useState('UGX');
  const [search, setSearch] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [chartAccounts, setChartAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [pagedReport, setPagedReport] = useState<PagedReport | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [selectedJournal, setSelectedJournal] = useState<Record<string, unknown> | null>(null);
  const [currencyRows, setCurrencyRows] = useState<Array<Record<string, unknown>>>([]);
  const [batchResult, setBatchResult] = useState<Record<string, unknown> | null>(null);
  const [currencyFormOpen, setCurrencyFormOpen] = useState(false);
  const [currencySubmitting, setCurrencySubmitting] = useState(false);
  const [currencyForm, setCurrencyForm] = useState({
    currency: '',
    baseCurrency: 'GBP',
    businessTimezone: 'Europe/London',
    cutoffTime: '00:00:00',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    approvedBy: '',
  });
  const loadControl = useCallback(async () => {
    try {
      const [result, schedule] = await Promise.all([
        adminRequest<Array<Record<string, unknown>>>('/admin/operations/accounting/v1/accounting/eod/runs?limit=100', token),
        adminRequest<Record<string, unknown>>('/admin/operations/accounting/v1/accounting/eod/schedule?reportingEntity=FINIFY_UK', token),
      ]);
      setRuns(Array.isArray(result) ? result : []);
      setEodSchedule(schedule);
      setScheduleForm({
        enabled: schedule.enabled !== false,
        businessTimezone: String(schedule.businessTimezone || 'Europe/London'),
        closureTime: String(schedule.closureTime || '00:05:00').slice(0, 8),
      });
      setMessage('');
    } catch (requestError) { setMessage((requestError as Error).message); }
  }, [token]);
  const saveSchedule = async () => {
    setScheduleSaving(true);
    try {
      const schedule = await adminRequest<Record<string, unknown>>(
        '/admin/operations/accounting/v1/accounting/eod/schedule', token,
        { method: 'PATCH', body: { ...scheduleForm, reportingEntity: 'FINIFY_UK', updatedBy: profile.username || 'finify-command' } },
      );
      setEodSchedule(schedule);
      setMessage(`Daily EOD schedule saved for ${scheduleForm.closureTime} ${scheduleForm.businessTimezone}.`);
    } catch (requestError) { setMessage((requestError as Error).message); }
    finally { setScheduleSaving(false); }
  };
  const runSchedulerNow = async () => {
    if (!window.confirm('Run the automatic EOD catch-up now? Every due currency date that passes controls will be closed.')) return;
    setScheduleRunning(true);
    try {
      const result = await adminRequest<Record<string, unknown>>(
        '/admin/operations/accounting/v1/accounting/eod/schedule/run-now', token,
        { method: 'POST', body: { reportingEntity: 'FINIFY_UK' } },
      );
      setMessage(`EOD scheduler: ${String(result.message || result.status)}.`);
      await Promise.all([loadControl(), loadCurrencies()]);
    } catch (requestError) { setMessage((requestError as Error).message); }
    finally { setScheduleRunning(false); }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void loadControl(), 0);
    return () => window.clearTimeout(timer);
  }, [loadControl]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const today = new Date().toISOString().slice(0, 10);
      setBusinessDate(today);
      setDateFrom(`${today.slice(0, 8)}01`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void adminRequest<Array<Record<string, unknown>>>('/admin/operations/accounting/v1/accounting/chart-of-accounts', token)
        .then(setChartAccounts).catch(() => setChartAccounts([]));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [token]);
  const dryRun = async () => {
    try {
      await adminRequest('/admin/operations/accounting/v1/accounting/eod/dry-run', token, {
        method: 'POST',
        body: { businessDate, currency, reportingEntity: 'FINIFY_UK', requestedBy: 'finify-command' },
      });
      setMessage(`EOD readiness check completed for ${businessDate}.`);
      await loadControl();
    } catch (requestError) { setMessage((requestError as Error).message); }
  };
  const loadCurrencies = useCallback(async () => {
    if (!businessDate) return;
    try {
      const rows = await adminRequest<Array<Record<string, unknown>>>(
        `/admin/operations/accounting/v1/accounting/configurations/currencies?reportingEntity=FINIFY_UK&businessDate=${businessDate}`,
        token,
      );
      setCurrencyRows(Array.isArray(rows) ? rows : []);
    } catch (requestError) { setMessage((requestError as Error).message); }
  }, [businessDate, token]);
  useEffect(() => {
    if (!businessDate) return;
    const timer = window.setTimeout(() => void loadCurrencies(), 0);
    return () => window.clearTimeout(timer);
  }, [businessDate, loadCurrencies]);
  const runCurrencyBatch = async (dryRunAll: boolean) => {
    if (!businessDate) return;
    if (!dryRunAll && !window.confirm(`Close every configured currency for ${businessDate}? Currencies that fail controls will remain blocked.`)) return;
    setLoading(true);
    setBatchResult(null);
    try {
      const result = await adminRequest<Record<string, unknown>>(
        '/admin/operations/accounting/v1/accounting/eod/batch',
        token,
        {
          method: 'POST',
          body: {
            businessDate,
            reportingEntity: 'FINIFY_UK',
            requestedBy: 'finify-command',
            dryRun: dryRunAll,
            correlationId: `COMMAND-${dryRunAll ? 'VALIDATE' : 'CLOSE'}-${businessDate}-${Date.now()}`,
          },
        },
      );
      setBatchResult(result);
      setMessage(dryRunAll ? 'All-currency readiness validation completed.' : 'All-currency close processing completed.');
      await Promise.all([loadCurrencies(), loadControl()]);
    } catch (requestError) { setMessage((requestError as Error).message); }
    finally { setLoading(false); }
  };
  const provisionCurrency = async () => {
    setCurrencySubmitting(true);
    try {
      const result = await adminRequest<{ configuration?: Record<string, unknown>; wallets?: Array<Record<string, unknown>> }>(
        '/admin/operations/accounting/v1/accounting/configurations/currencies',
        token,
        {
          method: 'POST',
          body: {
            ...currencyForm,
            currency: currencyForm.currency.toUpperCase(),
            reportingEntity: 'FINIFY_UK',
            requestedBy: profile.username || 'finify-command',
          },
        },
      );
      setMessage(`${String(result.configuration?.currency ?? currencyForm.currency)} provisioned with ${result.wallets?.length || 0} zero-balance system wallets.`);
      setCurrencyFormOpen(false);
      setCurrencyForm((current) => ({ ...current, currency: '', approvedBy: '' }));
      await loadCurrencies();
    } catch (requestError) { setMessage((requestError as Error).message); }
    finally { setCurrencySubmitting(false); }
  };
  const loadReport = useCallback(async (requestedView = view, requestedPage = page) => {
    if (requestedView === 'control' || requestedView === 'currencies' || !businessDate || !dateFrom) return;
    setLoading(true);
    try {
      const common = `currency=${currency}&reportingEntity=FINIFY_UK`;
      if (requestedView === 'journal' || requestedView === 'ledger') {
        const endpoint = requestedView === 'journal' ? 'journals' : 'general-ledger';
        const result = await adminRequest<PagedReport>(
          `/admin/operations/accounting/v1/accounting/reports/${endpoint}?dateFrom=${dateFrom}&dateTo=${businessDate}&${common}&page=${requestedPage}&limit=50&search=${encodeURIComponent(search)}${requestedView === 'ledger' ? `&accountCode=${encodeURIComponent(accountCode)}` : ''}`,
          token,
        );
        setPagedReport(result);
        setReport(null);
      } else {
        if (currency === 'ALL') {
          let configuredCurrencies = currencyRows
            .filter((row) => row.configured)
            .map((row) => String(row.currency));
          if (!configuredCurrencies.length) {
            const rows = await adminRequest<Array<Record<string, unknown>>>(
              `/admin/operations/accounting/v1/accounting/configurations/currencies?reportingEntity=FINIFY_UK&businessDate=${businessDate}`,
              token,
            );
            configuredCurrencies = rows.filter((row) => row.configured).map((row) => String(row.currency));
            setCurrencyRows(rows);
          }
          const reports = await Promise.all(configuredCurrencies.map(async (reportCurrency) => {
            const endpoint = requestedView === 'balance-sheet'
              ? `balance-sheet?businessDate=${businessDate}&currency=${reportCurrency}&reportingEntity=FINIFY_UK`
              : `income-statement?dateFrom=${dateFrom}&dateTo=${businessDate}&currency=${reportCurrency}&reportingEntity=FINIFY_UK`;
            return adminRequest<Record<string, unknown>>(
              `/admin/operations/accounting/v1/accounting/${endpoint}`,
              token,
            );
          }));
          setReport({
            scope: 'ALL CURRENCIES',
            currencyCount: reports.length,
            reports,
            accounts: reports.flatMap((currencyReport) => (
              Array.isArray(currencyReport.accounts)
                ? (currencyReport.accounts as Array<Record<string, unknown>>)
                  .map((row) => ({ ...row, currency: currencyReport.currency }))
                : []
            )),
          });
        } else {
          const endpoint = requestedView === 'balance-sheet'
            ? `balance-sheet?businessDate=${businessDate}&${common}`
            : `income-statement?dateFrom=${dateFrom}&dateTo=${businessDate}&${common}`;
          setReport(await adminRequest<Record<string, unknown>>(`/admin/operations/accounting/v1/accounting/${endpoint}`, token));
        }
        setPagedReport(null);
      }
      setMessage('');
    } catch (requestError) { setMessage((requestError as Error).message); }
    finally { setLoading(false); }
  }, [accountCode, businessDate, currency, currencyRows, dateFrom, page, search, token, view]);
  useEffect(() => {
    if (view === 'control' || view === 'currencies' || !businessDate || !dateFrom) return;
    const timer = window.setTimeout(() => void loadReport(view, page), 0);
    return () => window.clearTimeout(timer);
  }, [businessDate, dateFrom, loadReport, page, view]);
  const changeView = (next: AccountingView) => {
    if ((next === 'balance-sheet' || next === 'profit-loss') && eodSchedule?.lastBusinessDate) {
      const lastClosed = String(eodSchedule.lastBusinessDate).slice(0, 10);
      setBusinessDate(lastClosed);
      setDateFrom(`${lastClosed.slice(0, 8)}01`);
    }
    setView(next); setPage(1); setPagedReport(null); setReport(null); setSelectedJournal(null); setBatchResult(null); setCurrencyFormOpen(false); setMessage('');
  };
  const openJournal = async (id: unknown) => {
    try {
      setSelectedJournal(await adminRequest<Record<string, unknown>>(`/admin/operations/accounting/v1/accounting/reports/journals/${String(id)}`, token));
    } catch (requestError) { setMessage((requestError as Error).message); }
  };
  const exportRows = () => {
    const rows = (view === 'journal' || view === 'ledger')
      ? pagedReport?.data || []
      : Array.isArray(report?.accounts) ? report.accounts as Array<Record<string, unknown>> : [];
    if (!rows.length) { setMessage('There are no report rows to export.'); return; }
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const cell = (value: unknown) => {
      let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const csv = [columns.join(','), ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `finify-${view}-${dateFrom}-${businessDate}.csv`; link.click();
    URL.revokeObjectURL(url);
  };
  const reportAccounts = Array.isArray(report?.accounts) ? report.accounts as Array<Record<string, unknown>> : [];
  const statementReports = Array.isArray(report?.reports)
    ? report.reports as Array<Record<string, unknown>>
    : [];
  const journal = selectedJournal?.journal as Record<string, unknown> | undefined;
  const journalEntries = Array.isArray(selectedJournal?.entries) ? selectedJournal.entries as Array<Record<string, unknown>> : [];
  const journalTotals = selectedJournal?.totals as Record<string, unknown> | undefined;
  const batchCurrencies = Array.isArray(batchResult?.currencies)
    ? batchResult.currencies as Array<Record<string, unknown>>
    : [];
  const configuredCurrencyCount = currencyRows.filter((row) => row.configured).length;
  return (
    <section className="module-workspace">
      <ModuleHeader eyebrow="FINANCIAL CONTROL" title="Accounting control & reporting" copy="Control every currency close, inspect double-entry journals, and produce ledger and financial reports from authoritative accounting records." action={view === 'control' ? 'Run readiness check' : view === 'currencies' ? 'Validate all currencies' : 'Export current view'} onAction={() => view === 'control' ? (currency === 'ALL' ? void runCurrencyBatch(true) : void dryRun()) : view === 'currencies' ? void runCurrencyBatch(true) : exportRows()} />
      {message && <OperationNotice tone={/completed/i.test(message) ? 'success' : 'error'} message={message} />}
      <div className="module-metrics">
        <MiniMetric label={view === 'control' ? 'EOD RUNS' : view === 'currencies' ? 'ACTIVE CURRENCIES' : 'REPORT ROWS'} value={view === 'control' ? String(runs.length) : view === 'currencies' ? String(configuredCurrencyCount) : String(pagedReport?.totalRecords ?? reportAccounts.length)} />
        <MiniMetric label={view === 'control' ? 'CLOSED RUNS' : view === 'currencies' ? 'UNCONFIGURED' : 'CURRENCY SCOPE'} value={view === 'control' ? String(runs.filter((row) => row.status === 'CLOSED').length) : view === 'currencies' ? String(currencyRows.length - configuredCurrencyCount) : currency === 'ALL' ? `ALL ${configuredCurrencyCount}` : currency} />
        <MiniMetric label={view === 'control' ? 'AUTO EOD' : 'CONTROL MODE'} value={view === 'control' ? eodSchedule?.enabled ? 'ACTIVE' : 'PAUSED' : view === 'currencies' ? 'CLOSE ALL' : 'DOUBLE ENTRY'} />
      </div>
      <div className="accounting-view-tabs" role="tablist" aria-label="Accounting workspace">
        {([
          ['control', 'CONTROL'],
          ['currencies', 'MULTI-CURRENCY'],
          ['journal', 'JOURNAL REPORT'],
          ['ledger', 'GENERAL LEDGER'],
          ['balance-sheet', 'BALANCE SHEET'],
          ['profit-loss', 'PROFIT & LOSS'],
        ] as Array<[AccountingView, string]>).map(([id, label]) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => changeView(id)}>{label}</button>
        ))}
      </div>
      <div className="workspace-toolbar accounting-toolbar">
        {view !== 'balance-sheet' && view !== 'currencies' && <div className="accounting-date-field"><span>DATE FROM</span><ThemedDatePicker value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1); }} placeholder="Select start date" contextLabel="REPORT START DATE" /></div>}
        <div className="accounting-date-field"><span>{view === 'balance-sheet' ? 'AS OF DATE' : view === 'currencies' ? 'BUSINESS DATE' : 'DATE TO'}</span><ThemedDatePicker value={businessDate} onChange={(value) => { setBusinessDate(value); setPage(1); }} placeholder="Select business date" contextLabel={view === 'balance-sheet' ? 'BALANCE SHEET DATE' : view === 'currencies' ? 'EOD BUSINESS DATE' : 'REPORT END DATE'} /></div>
        {view !== 'currencies' && <label>CURRENCY<select value={currency} onChange={(event) => { setCurrency(event.target.value); setPage(1); setSelectedJournal(null); }}>
          <option value="ALL">ALL CURRENCIES</option>
          {currencyRows.filter((row) => row.configured).map((row) => <option key={String(row.currency)} value={String(row.currency)}>{String(row.currency)}</option>)}
        </select></label>}
        {view === 'ledger' && <label>GL ACCOUNT<select value={accountCode} onChange={(event) => { setAccountCode(event.target.value); setPage(1); }}><option value="">ALL ACCOUNTS</option>{chartAccounts.map((row) => <option key={String(row.accountCode)} value={String(row.accountCode)}>{String(row.accountCode)} · {String(row.accountName)}</option>)}</select></label>}
        {(view === 'journal' || view === 'ledger') && <label className="accounting-search">SEARCH<input value={search} placeholder="Journal, reference, wallet…" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { setPage(1); void loadReport(view, 1); } }} /></label>}
        {view === 'currencies' && <div className="row-actions"><button disabled={loading} onClick={() => setCurrencyFormOpen((open) => !open)}>ADD NEW CURRENCY</button><button disabled={loading} onClick={() => void runCurrencyBatch(true)}>VALIDATE ALL</button><button disabled={loading} className="danger-action" onClick={() => void runCurrencyBatch(false)}>CLOSE ALL CURRENCIES</button></div>}
        {view !== 'control' && view !== 'currencies' && <div className="row-actions"><button onClick={() => { setPage(1); void loadReport(view, 1); }}>REFRESH REPORT</button></div>}
      </div>
      {view === 'control' && <>
        <div className="panel eod-schedule-panel">
          <div className="eod-schedule-head"><PanelHead eyebrow="AUTOMATIC BUSINESS CLOSE" title="Daily EOD schedule" /><span className={`eod-schedule-state ${eodSchedule?.enabled ? 'active' : ''}`}><i />{eodSchedule?.enabled ? 'AUTOMATIC CLOSE ACTIVE' : 'SCHEDULE PAUSED'}</span></div>
          <div className="eod-schedule-status">
            <div><span>NEXT CLOSE</span><strong>{String(eodSchedule?.nextClosureLocal || 'Loading…')}</strong><small>Closes business date {String(eodSchedule?.closesBusinessDate || '—')}</small></div>
            <div><span>LAST SCHEDULER RESULT</span><strong>{String(eodSchedule?.lastStatus || 'NOT RUN')}</strong><small>{String(eodSchedule?.lastMessage || 'No scheduled result recorded')}</small></div>
            <div><span>CURRENCY COVERAGE</span><strong>{String(eodSchedule?.closedCurrencyCount ?? 0)} / {String(eodSchedule?.currencyCount ?? configuredCurrencyCount)}</strong><small>Currencies closed through the due business date</small></div>
          </div>
          <div className="eod-schedule-form">
            <label className="security-switch"><div><strong>Automatic daily EOD</strong><span>Poll continuously and catch up missed business dates after downtime.</span></div><input type="checkbox" checked={scheduleForm.enabled} onChange={(event) => setScheduleForm({ ...scheduleForm, enabled: event.target.checked })} /><i /></label>
            <label>BUSINESS TIMEZONE<input value={scheduleForm.businessTimezone} onChange={(event) => setScheduleForm({ ...scheduleForm, businessTimezone: event.target.value })} placeholder="Europe/London" /></label>
            <label>DAILY CLOSURE TIME<input type="time" step="1" value={scheduleForm.closureTime} onChange={(event) => setScheduleForm({ ...scheduleForm, closureTime: event.target.value })} /><small>The preceding business date becomes due at this local time.</small></label>
            <div className="row-actions"><button disabled={scheduleRunning || scheduleSaving} onClick={() => void runSchedulerNow()}>{scheduleRunning ? 'RUNNING…' : 'RUN DUE CLOSE NOW'}</button><button className="command-button" disabled={scheduleSaving || !scheduleForm.businessTimezone || !scheduleForm.closureTime} onClick={() => void saveSchedule()}>{scheduleSaving ? <LoaderCircle className="spin" /> : <Check />}{scheduleSaving ? 'SAVING…' : 'SAVE SCHEDULE'}</button></div>
          </div>
        </div>
        <div className="panel operational-table">
        <PanelHead eyebrow="PERIOD CLOSE" title="End-of-day control runs" />
        <table><thead><tr><th>RUN</th><th>BUSINESS DATE</th><th>CURRENCY</th><th>MODE</th><th>VARIANCE</th><th>STATUS</th></tr></thead><tbody>
          {!runs.length && <EmptyRow columns={6} message="No EOD runs are available." />}
          {runs.map((row, index) => <tr key={String(row.id ?? row.runId ?? index)}><td><span className="table-code">{String(row.id ?? row.runId ?? '—')}</span></td><td>{String(row.businessDate ?? row.business_date ?? '—')}</td><td>{String(row.currency ?? '—')}</td><td>{row.dryRun || row.dry_run ? 'DRY RUN' : 'CLOSE'}</td><td className="numeric">{String(row.safeguardingVariance ?? row.safeguarding_variance ?? '—')}</td><td><StatusPill value={String(row.status ?? 'UNKNOWN')} /></td></tr>)}
        </tbody></table>
        </div>
      </>}
      {view === 'currencies' && <>
        {currencyFormOpen && <div className="panel currency-provision-panel">
          <div className="currency-provision-head"><PanelHead eyebrow="ATOMIC PROVISIONING" title="Add a new operating currency" /><button className="drawer-close" onClick={() => setCurrencyFormOpen(false)} aria-label="Close currency form"><X /></button></div>
          <p>The currency is created with zero balances. Temporary reserve, safeguarding, charge revenue, and commission funding wallets are provisioned together; Treasury and EOD discover them automatically.</p>
          <div className="currency-provision-form">
            <label>CURRENCY<input maxLength={3} placeholder="EUR" value={currencyForm.currency} onChange={(event) => setCurrencyForm({ ...currencyForm, currency: event.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} /></label>
            <label>BASE CURRENCY<select value={currencyForm.baseCurrency} onChange={(event) => setCurrencyForm({ ...currencyForm, baseCurrency: event.target.value })}>{currencyRows.filter((row) => row.configured).map((row) => <option key={String(row.currency)} value={String(row.currency)}>{String(row.currency)}</option>)}</select></label>
            <label>BUSINESS TIMEZONE<input value={currencyForm.businessTimezone} onChange={(event) => setCurrencyForm({ ...currencyForm, businessTimezone: event.target.value })} /></label>
            <label>CUTOFF TIME<input type="time" step="1" value={currencyForm.cutoffTime} onChange={(event) => setCurrencyForm({ ...currencyForm, cutoffTime: event.target.value })} /></label>
            <label>EFFECTIVE FROM<input type="date" value={currencyForm.effectiveFrom} onChange={(event) => setCurrencyForm({ ...currencyForm, effectiveFrom: event.target.value })} /></label>
            <label>CHECKER USERNAME<input placeholder="Different administrator" value={currencyForm.approvedBy} onChange={(event) => setCurrencyForm({ ...currencyForm, approvedBy: event.target.value })} /></label>
          </div>
          <div className="currency-wallet-preview">
            {[['105', 'TEMPORARY RESERVE'], ['110', 'SAFEGUARDING'], ['113', 'CHARGE REVENUE'], ['114', 'COMMISSION FUNDING'], ['115', 'BANK PREFUNDING'], ['116', 'OWNER CAPITAL'], ['117', 'CUSTOMER FUNDS LIABILITY']].map(([code, name]) => <div key={code}><span>{code}</span><strong>{name}</strong><small>ZERO OPENING BALANCE</small></div>)}
          </div>
          <div className="row-actions"><button onClick={() => setCurrencyFormOpen(false)}>CANCEL</button><button className="command-button" disabled={currencySubmitting || currencyForm.currency.length !== 3 || currencyForm.approvedBy.trim().length < 2 || currencyForm.approvedBy.trim().toLowerCase() === String(profile.username || '').trim().toLowerCase()} onClick={() => void provisionCurrency()}>{currencySubmitting ? <LoaderCircle className="spin" /> : <Check />} PROVISION CURRENCY</button></div>
        </div>}
        <div className="currency-control-summary">
          <div><span>EXPECTED SET</span><strong>{currencyRows.map((row) => String(row.currency)).join(' · ') || '—'}</strong><small>Derived from configurations, wallets, and posted journals</small></div>
          <div><span>GLOBAL DATE STATUS</span><strong>{String(batchResult?.status ?? (currencyRows.every((row) => row.periodStatus === 'CLOSED') ? 'CLOSED' : 'OPEN'))}</strong><small>The date closes only when every expected currency closes</small></div>
          <div><span>BASE CURRENCY</span><strong>GBP</strong><small>Original ledgers remain in transaction currency</small></div>
        </div>
        <div className="panel operational-table">
          <PanelHead eyebrow="CURRENCY REGISTRY" title="Multi-currency close control" />
          <table><thead><tr><th>CURRENCY</th><th>CONFIGURATION</th><th>SAFEGUARDING WALLET</th><th>MASTER BALANCE</th><th>ACTIVITY</th><th>PERIOD</th><th>LATEST CONTROL</th></tr></thead><tbody>
            {!currencyRows.length && <EmptyRow columns={7} message="No accounting currencies are registered or observed." />}
            {currencyRows.map((row) => <tr key={String(row.currency)}>
              <td><div className="currency-badge">{String(row.currency)}</div></td>
              <td><div className="primary-cell"><strong>{row.configured ? `${String(row.businessTimezone)} · ${String(row.cutoffTime).slice(0, 8)}` : 'CONFIGURATION MISSING'}</strong><small>Base {String(row.baseCurrency ?? '—')} · Safeguarding {row.strictSafeguarding ? 'strict' : 'standard'}</small></div></td>
              <td><span className="table-code">{String(row.masterWallet ?? '—')}</span></td>
              <td className="numeric">{row.configured ? formatMoney(String(row.masterBalance ?? 0), String(row.currency)) : '—'}</td>
              <td><div className="primary-cell"><strong>{String(row.walletCount ?? 0)} wallets</strong><small>{String(row.journalCount ?? 0)} journals on selected date</small></div></td>
              <td><StatusPill value={String(row.periodStatus ?? 'OPEN')} /></td>
              <td><div className="primary-cell"><StatusPill value={String(row.latestRunStatus ?? (row.configured ? 'NOT RUN' : 'BLOCKED'))} /><small>{row.latestRunDate ? String(row.latestRunDate).slice(0, 10) : 'No control run'} · Variance {String(row.latestVariance ?? '—')}</small></div></td>
            </tr>)}
          </tbody></table>
        </div>
        {batchResult && <div className="panel operational-table batch-result-panel">
          <PanelHead eyebrow={batchResult.dryRun ? 'ALL-CURRENCY VALIDATION' : 'ALL-CURRENCY CLOSE'} title={`BATCH ${String(batchResult.status)}`} />
          <table><thead><tr><th>CURRENCY</th><th>CONFIGURED</th><th>RESULT</th><th>READINESS</th><th>DETAIL</th></tr></thead><tbody>
            {batchCurrencies.map((row) => {
              const nested = row.result as Record<string, unknown> | undefined;
              const readiness = nested?.readiness as Record<string, unknown> | undefined;
              const checks = Array.isArray(readiness?.checks) ? readiness.checks as Array<Record<string, unknown>> : [];
              const failedChecks = checks.filter((check) => check.status !== 'PASS');
              return <tr key={String(row.currency)}><td><div className="currency-badge">{String(row.currency)}</div></td><td><StatusPill value={row.configured ? 'CONFIGURED' : 'MISSING'} /></td><td><StatusPill value={String(row.status)} /></td><td>{failedChecks.length ? <div className="primary-cell"><strong>{failedChecks.length} exception(s)</strong><small>{failedChecks.map((check) => String(check.code)).join(' · ')}</small></div> : 'ALL CONTROLS PASSED'}</td><td>{String(row.error ?? nested?.status ?? '—')}</td></tr>;
            })}
          </tbody></table>
        </div>}
      </>}
      {view === 'journal' && <div className="panel operational-table">
        <PanelHead eyebrow="POSTED ACTIVITY" title="Accounting journal" />
        <table><thead><tr><th>JOURNAL / TRANSACTION</th><th>DATE</th><th>MODE</th><th>REFERENCE</th><th>DEBIT</th><th>CREDIT</th><th>CONTROL</th></tr></thead><tbody>
          {loading && <LoadingRow columns={7} />}
          {!loading && !pagedReport?.data?.length && <EmptyRow columns={7} message="No journals match the selected reporting period." />}
          {!loading && pagedReport?.data?.map((row) => <tr key={String(row.id)} className="clickable-report-row" onClick={() => void openJournal(row.id)}>
            <td><div className="primary-cell"><strong>J-{String(row.id)}</strong><small>TX {String(row.transactionId)}</small></div></td>
            <td>{String(row.businessDate ?? '—').slice(0, 10)}</td>
            <td><span className="table-code">{String(row.mode)} · {String(row.action)} L{String(row.leg)}</span></td>
            <td><div className="primary-cell"><strong>{String(row.keyword ?? 'UNSPECIFIED')}</strong><small>{String(row.reference ?? 'No reference')}</small></div></td>
            <td className="numeric">{formatMoney(String(row.totalDebit ?? 0), String(row.currency))}</td>
            <td className="numeric">{formatMoney(String(row.totalCredit ?? 0), String(row.currency))}</td>
            <td><StatusPill value={row.balanced ? String(row.status) : 'UNBALANCED'} /></td>
          </tr>)}
        </tbody></table>
      </div>}

      {view === 'ledger' && <>
        {currency !== 'ALL' && pagedReport?.totals && <div className="accounting-ledger-control">
          <DataPoint label="TOTAL DEBIT" value={formatMoney(String(pagedReport.totals.totalDebit ?? 0), currency)} />
          <DataPoint label="TOTAL CREDIT" value={formatMoney(String(pagedReport.totals.totalCredit ?? 0), currency)} />
          <DataPoint label="DIFFERENCE" value={formatMoney(String(pagedReport.totals.difference ?? 0), currency)} />
          <DataPoint label="LEDGER CONTROL" value={pagedReport.totals.balanced ? 'BALANCED' : 'UNBALANCED'} />
          <DataPoint label="UNMAPPED LINES" value={String(pagedReport.totals.unmappedCount ?? 0)} />
        </div>}
        {currency === 'ALL' && Boolean(pagedReport?.currencyTotals?.length) && <div className="accounting-control-cards">
          {pagedReport?.currencyTotals?.map((row) => <div className="accounting-control-card" key={String(row.currency)}>
            <span>{String(row.currency)}</span><strong>{row.balanced ? 'BALANCED' : 'UNBALANCED'}</strong>
            <div><small>DEBIT</small><b>{formatMoney(String(row.totalDebit ?? 0), String(row.currency))}</b></div>
            <div><small>CREDIT</small><b>{formatMoney(String(row.totalCredit ?? 0), String(row.currency))}</b></div>
          </div>)}
        </div>}
        <div className="accounting-control-cards">
          {(pagedReport?.accounts || []).map((row) => <div className="accounting-control-card" key={`${String(row.currency)}-${String(row.accountCode)}`}>
            <span>{String(row.currency)} · {String(row.accountCode)}</span><strong>{String(row.accountName)}</strong>
            <div><small>OPENING</small><b>{formatMoney(String(row.openingBalance ?? 0), String(row.currency ?? currency))}</b></div>
            <div><small>CLOSING</small><b>{formatMoney(String(row.closingBalance ?? 0), String(row.currency ?? currency))}</b></div>
          </div>)}
        </div>
        <div className="panel operational-table">
          <PanelHead eyebrow="ACCOUNT MOVEMENTS" title="General ledger" />
          <table><thead><tr><th>DATE</th><th>GL ACCOUNT</th><th>JOURNAL / TX</th><th>WALLET ACCOUNT</th><th>DESCRIPTION</th><th>DEBIT</th><th>CREDIT</th></tr></thead><tbody>
            {loading && <LoadingRow columns={7} />}
            {!loading && !pagedReport?.data?.length && <EmptyRow columns={7} message="No ledger movements match the selected filters." />}
            {!loading && pagedReport?.data?.map((row) => <tr key={String(row.id)}>
              <td>{String(row.businessDate ?? '—').slice(0, 10)}</td>
              <td><div className="primary-cell"><strong>{String(row.accountCode)}</strong><small>{String(row.accountName)}{row.mappingException ? ' · MAPPING REQUIRED' : ''}</small></div></td>
              <td><button className="table-link" onClick={() => void openJournal(row.journalId)}>J-{String(row.journalId)}</button><small className="sub-value">TX {String(row.transactionId)}</small></td>
              <td><span className="table-code">{String(row.walletAccount)}</span></td>
              <td>{String(row.description ?? row.reference ?? '—')}</td>
              <td className="numeric">{formatMoney(String(row.debit ?? 0), String(row.currency ?? currency))}</td>
              <td className="numeric">{formatMoney(String(row.credit ?? 0), String(row.currency ?? currency))}</td>
            </tr>)}
          </tbody></table>
        </div>
      </>}

      {(view === 'balance-sheet' || view === 'profit-loss') && report && <div className="panel report-view">
        <PanelHead eyebrow="PERSISTED FINANCIAL STATEMENT" title={`${view === 'balance-sheet' ? 'BALANCE SHEET' : 'PROFIT & LOSS'}${currency === 'ALL' ? ' · ALL CURRENCIES' : ''}`} />
        {currency === 'ALL' && <div className="accounting-control-cards">
          {statementReports.map((currencyReport) => <div className="accounting-control-card" key={String(currencyReport.currency)}>
            <span>{String(currencyReport.currency)}</span><strong>{view === 'balance-sheet' ? (currencyReport.balanced ? 'BALANCED' : 'UNBALANCED') : 'PERIOD RESULT'}</strong>
            {view === 'balance-sheet'
              ? <><div><small>ASSETS</small><b>{formatMoney(String(currencyReport.totalAssets ?? 0), String(currencyReport.currency))}</b></div><div><small>LIABILITIES</small><b>{formatMoney(String(currencyReport.totalLiabilities ?? 0), String(currencyReport.currency))}</b></div></>
              : <><div><small>INCOME</small><b>{formatMoney(String(currencyReport.totalIncome ?? 0), String(currencyReport.currency))}</b></div><div><small>PROFIT / LOSS</small><b>{formatMoney(String(currencyReport.profitOrLoss ?? 0), String(currencyReport.currency))}</b></div></>}
          </div>)}
        </div>}
        <div className="drawer-grid">
          {Object.entries(report).filter(([, value]) => !Array.isArray(value) && (value === null || typeof value !== 'object')).map(([key, value]) => <DataPoint key={key} label={key.replace(/([A-Z])/g, ' $1').toUpperCase()} value={String(value ?? '—')} />)}
        </div>
        <div className="operational-table"><table><thead><tr>{currency === 'ALL' && <th>CURRENCY</th>}<th>ACCOUNT</th><th>NAME</th><th>TYPE</th><th>SECTION</th><th>AMOUNT</th></tr></thead><tbody>
          {!reportAccounts.length && <EmptyRow columns={currency === 'ALL' ? 6 : 5} message="No closed financial statement exists for this period. Complete EOD first." />}
          {reportAccounts.map((row, index) => <tr key={`${String(row.currency ?? currency)}-${String(row.account_code ?? row.accountCode ?? index)}`}>{currency === 'ALL' && <td><div className="currency-badge">{String(row.currency)}</div></td>}<td><span className="table-code">{String(row.account_code ?? row.accountCode ?? '—')}</span></td><td>{String(row.account_name ?? row.accountName ?? '—')}</td><td>{String(row.account_type ?? row.accountType ?? '—')}</td><td>{String(row.statement_section ?? row.statementSection ?? '—')}</td><td className="numeric">{formatMoney(String(row.amount ?? row.closing_balance ?? row.closingBalance ?? 0), String(row.currency ?? currency))}</td></tr>)}
        </tbody></table></div>
      </div>}

      {(view === 'journal' || view === 'ledger') && pagedReport && <div className="registry-pagination">
        <span>PAGE {pagedReport.page || page} OF {pagedReport.totalPages || 1} · {pagedReport.totalRecords || 0} RECORDS</span>
        <div><button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft /> PREVIOUS</button><button disabled={page >= Number(pagedReport.totalPages || 1)} onClick={() => setPage((current) => current + 1)}>NEXT <ChevronRight /></button></div>
      </div>}

      {selectedJournal && <div className="panel report-view accounting-journal-detail">
        <div className="panel-title-row"><PanelHead eyebrow="DOUBLE-ENTRY DRILL DOWN" title={`JOURNAL J-${String(journal?.id ?? '—')}`} /><button className="drawer-close" onClick={() => setSelectedJournal(null)} aria-label="Close journal detail"><X /></button></div>
        <div className="drawer-grid">
          <DataPoint label="TRANSACTION" value={String(journal?.transactionId ?? '—')} />
          <DataPoint label="BUSINESS DATE" value={String(journal?.businessDate ?? '—').slice(0, 10)} />
          <DataPoint label="OPERATION" value={`${String(journal?.mode ?? '—')} · ${String(journal?.action ?? '—')} L${String(journal?.leg ?? '—')}`} />
          <DataPoint label="STATUS" value={String(journal?.status ?? '—')} />
          <DataPoint label="TOTAL DEBIT" value={formatMoney(String(journalTotals?.totalDebit ?? 0), String(journal?.currency ?? currency))} />
          <DataPoint label="TOTAL CREDIT" value={formatMoney(String(journalTotals?.totalCredit ?? 0), String(journal?.currency ?? currency))} />
          <DataPoint label="DIFFERENCE" value={formatMoney(String(journalTotals?.difference ?? 0), String(journal?.currency ?? currency))} />
          <DataPoint label="CONTROL" value={journalTotals?.balanced ? 'BALANCED' : 'UNBALANCED'} />
        </div>
        <div className="operational-table"><table><thead><tr><th>LINE</th><th>GL ACCOUNT</th><th>WALLET ACCOUNT</th><th>DESCRIPTION</th><th>DEBIT</th><th>CREDIT</th><th>BALANCE AFTER</th></tr></thead><tbody>
          {journalEntries.map((row) => <tr key={String(row.id)}><td>{String(row.lineNumber)}</td><td><div className="primary-cell"><strong>{String(row.glAccountCode)}</strong><small>{String(row.accountName)}</small></div></td><td><span className="table-code">{String(row.accountNumber)}</span></td><td>{String(row.description ?? '—')}</td><td className="numeric">{formatMoney(String(row.debit ?? 0), String(row.currency))}</td><td className="numeric">{formatMoney(String(row.credit ?? 0), String(row.currency))}</td><td className="numeric">{formatMoney(String(row.balanceAfter ?? 0), String(row.currency))}</td></tr>)}
        </tbody></table></div>
      </div>}
    </section>
  );
}

function ApprovalWorkspace({ token, profile }: { token: string; profile: AdminProfile }) {
  type ApprovalQueueItem = {
    id: string;
    kind: 'reference-data' | 'pricing-flow' | 'treasury-funding' | 'kyc';
    resource: string;
    resourceKey: string;
    action: string;
    maker: string;
    createdAt?: unknown;
    evidenceDocumentId?: string;
    evidenceDocumentName?: string;
    makerComment?: string;
    baseSnapshot?: Record<string, unknown> | null;
    proposedSnapshot?: Record<string, unknown> | null;
    details: Record<string, unknown>;
  };
  const [requests, setRequests] = useState<ApprovalQueueItem[]>([]);
  const [message, setMessage] = useState('');
  const [reviewRequest, setReviewRequest] = useState<ApprovalQueueItem | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decisionComment, setDecisionComment] = useState('');
  const load = useCallback(async () => {
    try {
      const [referenceResult, pricingResult, treasuryResult, kycResult] = await Promise.all([
        adminRequest<{ data: Array<Record<string, unknown>> }>(
          '/admin/reference-data/change-requests?limit=100&status=PENDING',
          token,
        ),
        adminRequest<PricingFlowRecord[]>(
          '/admin/operations/pricing-flows?limit=200&status=SUBMITTED',
          token,
        ),
        adminRequest<TreasuryFundingRequest[]>(
          '/admin/operations/treasury-funding-requests?status=PENDING',
          token,
        ),
        adminRequest<{ data: Array<Record<string, unknown>> }>(
          '/admin/operations/kyc/cases?status=MANUAL_REVIEW&limit=100',
          token,
        ),
      ]);
      const referenceRequests: ApprovalQueueItem[] = (referenceResult.data || []).map(
        (row) => ({
          id: String(row.id),
          kind: 'reference-data',
          resource: String(row.resourceType),
          resourceKey: String(row.resourceKey),
          action: String(row.action),
          maker: String(row.makerUsername),
          createdAt: row.createdAt,
          makerComment: String(row.makerComment || ''),
          baseSnapshot: (row.baseSnapshot as Record<string, unknown> | null) || null,
          proposedSnapshot: (row.proposedSnapshot as Record<string, unknown> | null) || null,
          details: row,
        }),
      );
      const pricingRequests: ApprovalQueueItem[] = (pricingResult || []).map((flow) => ({
        id: flow.id,
        kind: 'pricing-flow',
        resource: 'CHARGE & COMMISSION',
        resourceKey: `${flow.ruleCode} v${flow.version} · ${flow.name}`,
        action: 'APPROVE PRICING FLOW',
        maker: flow.modifiedBy || flow.createdBy,
        createdAt: flow.updatedAt,
        details: flow as unknown as Record<string, unknown>,
      }));
      const treasuryRequests: ApprovalQueueItem[] = (treasuryResult || []).map((request) => ({
        id: request.id,
        kind: 'treasury-funding',
        resource: request.businessPurpose.replaceAll('_', ' '),
        resourceKey: `${request.direction} · ${formatMoney(request.amount, request.currency)} · ${request.reference} · ${request.bankName}`,
        action: request.direction === 'DEBIT' ? 'APPROVE BANK WITHDRAWAL' : 'APPROVE BANK DEPOSIT',
        maker: request.maker,
        createdAt: request.createdAt,
        evidenceDocumentId: request.evidenceDocumentId,
        evidenceDocumentName: request.evidenceDocumentName,
        makerComment: request.makerComment,
        details: request as unknown as Record<string, unknown>,
      }));
      const kycRequests: ApprovalQueueItem[] = (kycResult.data || []).map((row) => ({
        id: String(row.id),
        kind: 'kyc',
        resource: 'KYC & IDENTITY',
        resourceKey: `${String(row.customerMsisdn)} · ${String(row.documentType).replaceAll('_', ' ')} · face ${row.faceMatchScore ?? 'pending'}`,
        action: 'APPROVE IDENTITY VERIFICATION',
        maker: String(row.createdBy || 'KYC_SYSTEM'),
        createdAt: row.createdAt,
        details: row,
      }));
      setRequests([...kycRequests, ...treasuryRequests, ...pricingRequests, ...referenceRequests]);
      setMessage('');
    } catch (requestError) { setMessage((requestError as Error).message); }
  }, [token]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const openReview = async (request: ApprovalQueueItem) => {
    setReviewRequest(request);
    setDecisionComment('');
    setReviewLoading(true);
    try {
      const details = request.kind === 'reference-data'
        ? await adminRequest<Record<string, unknown>>(`/admin/reference-data/change-requests/${request.id}`, token)
        : request.kind === 'pricing-flow'
          ? await adminRequest<Record<string, unknown>>(`/admin/operations/pricing-flows/${request.id}`, token)
          : request.kind === 'kyc'
            ? await adminRequest<Record<string, unknown>>(`/admin/operations/kyc/cases/${request.id}`, token)
            : request.details;
      setReviewRequest((current) => current?.id === request.id && current.kind === request.kind
        ? {
          ...current,
          details,
          makerComment: String(details.makerComment || current.makerComment || ''),
          baseSnapshot: (details.baseSnapshot as Record<string, unknown> | null | undefined) ?? current.baseSnapshot,
          proposedSnapshot: (details.proposedSnapshot as Record<string, unknown> | null | undefined) ?? current.proposedSnapshot,
        }
        : current);
    } catch (requestError) {
      setMessage((requestError as Error).message);
      setReviewRequest(null);
    } finally {
      setReviewLoading(false);
    }
  };
  const decide = async (request: ApprovalQueueItem, action: 'approve' | 'reject') => {
    if (action === 'reject' && !decisionComment.trim()) {
      setMessage('Enter a rejection reason before returning this change to the maker.');
      return;
    }
    setDecisionSubmitting(true);
    try {
      const checkerComment = decisionComment.trim() || 'Reviewed and approved in Finify Command';
      const route = request.kind === 'kyc'
        ? `/admin/operations/kyc/cases/${request.id}/review`
        : request.kind === 'pricing-flow'
        ? `/admin/operations/pricing-flows/${request.id}/${action}`
        : request.kind === 'treasury-funding'
          ? `/admin/operations/treasury-funding-requests/${request.id}/${action}`
          : `/admin/reference-data/change-requests/${request.id}/${action}`;
      await adminRequest(route, token, {
        method: request.kind === 'kyc' ? 'PATCH' : 'POST',
        body: request.kind === 'kyc'
          ? { action: action === 'approve' ? 'APPROVE' : 'REJECT', reason: checkerComment }
          : request.kind === 'treasury-funding'
          ? { comment: checkerComment }
          : action === 'approve'
            ? { comment: checkerComment }
            : { reason: checkerComment },
      });
      setMessage(`Request ${request.id} ${action}d.`);
      setReviewRequest(null);
      setDecisionComment('');
      await load();
    } catch (requestError) { setMessage((requestError as Error).message); }
    finally { setDecisionSubmitting(false); }
  };
  const downloadEvidence = async (request: ApprovalQueueItem) => {
    if (!request.evidenceDocumentId) return;
    try {
      const response = await sessionFetch(
        `${API_URL}/admin/operations/treasury-documents/${request.evidenceDocumentId}/download`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        const raw = await response.json().catch(() => ({}));
        throw new Error(raw?.message || `Document download failed (${response.status})`);
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = request.evidenceDocumentName || `treasury-document-${request.evidenceDocumentId}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (requestError) {
      setMessage((requestError as Error).message);
    }
  };
  const reviewIsMaker = reviewRequest?.maker.trim().toLowerCase() ===
    String(profile.username || '').trim().toLowerCase();
  const renderApprovalReviewContent = (request: ApprovalQueueItem, onDownloadEvidence: () => void) => {
    const details = request.details;
    if (request.kind === 'reference-data') {
      const before = request.baseSnapshot || {};
      const after = request.proposedSnapshot || {};
      const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
      return <div className="approval-evidence">
        <div className="approval-section-head"><div><span>PROPOSED CHANGE</span><strong>Current value compared with requested value</strong></div><small>{fields.filter((field) => approvalValue(before[field]) !== approvalValue(after[field])).length} fields changed</small></div>
        <div className="approval-diff-table"><header><span>FIELD</span><span>CURRENT</span><span>PROPOSED</span></header>{fields.map((field) => {
          const changed = approvalValue(before[field]) !== approvalValue(after[field]);
          return <div className={changed ? 'changed' : ''} key={field}><strong>{humanizeApprovalField(field)}</strong><span>{request.action === 'CREATE' ? 'Not set' : approvalValue(before[field])}</span><span>{approvalValue(after[field])}</span></div>;
        })}</div>
      </div>;
    }
    if (request.kind === 'pricing-flow') {
      const definition = (details.definition || {}) as Record<string, unknown>;
      const trigger = (definition.trigger || {}) as Record<string, unknown>;
      const route = (definition.route || {}) as Record<string, unknown>;
      const condition = (definition.condition || {}) as Record<string, unknown>;
      const charge = (definition.charge || {}) as Record<string, unknown>;
      const commission = (definition.commission || {}) as Record<string, unknown>;
      const settlement = (definition.settlement || {}) as Record<string, unknown>;
      return <div className="approval-evidence">
        <div className="approval-section-head"><div><span>PRICING DEFINITION</span><strong>Complete charge and commission flow</strong></div><small>{String(details.currency || trigger.currency || '—')}</small></div>
        <div className="drawer-grid approval-data-grid">
          <DataPoint label="RULE CODE / VERSION" value={`${String(details.ruleCode || '—')} v${String(details.version || '—')}`} />
          <DataPoint label="NAME / PRIORITY" value={`${String(details.name || '—')} · ${String(details.priority ?? '—')}`} />
          <DataPoint label="SERVICE KEYWORDS" value={approvalValue(trigger.keywords || trigger.keyword)} />
          <DataPoint label="CURRENCY" value={String(details.currency || trigger.currency || '—')} />
          <DataPoint label="SOURCE WALLET TYPES" value={approvalValue(route.sourceWalletTypes || route.sourceWalletType)} />
          <DataPoint label="DESTINATION WALLET TYPES" value={approvalValue(route.destinationWalletTypes || route.destinationWalletType)} />
          <DataPoint label="AMOUNT RANGE" value={`${approvalValue(condition.minimumAmount)} → ${approvalValue(condition.maximumAmount)}`} />
          <DataPoint label="CHARGE" value={charge.enabled === false ? 'Disabled' : `${approvalValue(charge.type)} ${approvalValue(charge.value)} · payer ${approvalValue(charge.payer)}`} />
          <DataPoint label="CHARGE LIMITS" value={`${approvalValue(charge.minimum)} → ${approvalValue(charge.maximum)} · ${Array.isArray(charge.ranges) ? charge.ranges.length : 0} ranges`} />
          <DataPoint label="COMMISSION" value={commission.enabled === false ? 'Disabled' : `${approvalValue(commission.type)} ${approvalValue(commission.value)} · receiver ${approvalValue(commission.receiver)}`} />
          <DataPoint label="COMMISSION LIMITS" value={`${approvalValue(commission.minimum)} → ${approvalValue(commission.maximum)} · ${Array.isArray(commission.ranges) ? commission.ranges.length : 0} ranges`} />
          <DataPoint label="SETTLEMENT WALLETS" value={`Charge ${approvalValue(settlement.chargeWalletType)} · Commission ${approvalValue(settlement.commissionWalletType)}`} />
        </div>
      </div>;
    }
    if (request.kind === 'treasury-funding') {
      return <div className="approval-evidence">
        <div className="approval-section-head"><div><span>TREASURY EVIDENCE</span><strong>Bank movement and destination account</strong></div><small>{String(details.direction || '')}</small></div>
        <div className="drawer-grid approval-data-grid">
          <DataPoint label="MOVEMENT" value={String(details.businessPurpose || request.resource).replaceAll('_', ' ')} />
          <DataPoint label="ACCOUNTING CLASSIFICATION" value={String(details.fundingClassification || 'NOT_APPLICABLE').replaceAll('_', ' ')} />
          <DataPoint label="AMOUNT" value={formatMoney(String(details.amount || 0), String(details.currency || 'GBP'))} />
          <DataPoint label="FINIFY WALLET" value={`${String(details.walletName || '—')} · ${String(details.walletId || '—')}`} />
          <DataPoint label="WALLET CODE / CURRENCY" value={`${String(details.walletCode || '—')} · ${String(details.currency || '—')}`} />
          <DataPoint label="BANK" value={String(details.bankName || '—')} />
          <DataPoint label="BANK ACCOUNT / IBAN" value={String(details.bankAccount || '—')} />
          <DataPoint label="BANK REFERENCE" value={String(details.reference || '—')} />
          <DataPoint label="VALUE DATE" value={String(details.valueDate || '—').slice(0, 10)} />
          <DataPoint label="EVIDENCE REFERENCE" value={String(details.evidenceReference || '—')} />
          <DataPoint label="DOCUMENT" value={String(details.evidenceDocumentName || 'Not attached')} />
          {String(details.fundingType) === 'SAFEGUARDING' && <DataPoint
            label="JOURNAL IMPACT"
            value={`${String(details.direction) === 'DEBIT' ? 'Dr classification / Cr safeguarding asset' : 'Dr safeguarding asset / Cr classification'} · no P&L impact`}
          />}
        </div>
        {request.evidenceDocumentId && <button className="approval-document-button" onClick={onDownloadEvidence}><ReceiptText /> DOWNLOAD AND INSPECT BANK DOCUMENT</button>}
      </div>;
    }
    const documents = Array.isArray(details.documents) ? details.documents as Array<Record<string, unknown>> : [];
    return <div className="approval-evidence">
      <div className="approval-section-head"><div><span>IDENTITY EVIDENCE</span><strong>Verification result and submitted documents</strong></div><small>{String(details.systemRecommendation || details.status || '—')}</small></div>
      <div className="drawer-grid approval-data-grid">
        <DataPoint label="CUSTOMER MSISDN" value={String(details.customerMsisdn || '—')} />
        <DataPoint label="DOCUMENT TYPE" value={String(details.documentType || '—').replaceAll('_', ' ')} />
        <DataPoint label="ISSUING COUNTRY" value={String(details.issuingCountry || '—')} />
        <DataPoint label="SYSTEM RECOMMENDATION" value={String(details.systemRecommendation || '—')} />
        <DataPoint label="FACE MATCH SCORE" value={String(details.faceMatchScore ?? 'Pending')} />
        <DataPoint label="AML / SANCTIONS MATCH" value={details.amlMatch === true ? 'MATCH — REVIEW REQUIRED' : details.amlMatch === false ? 'No match' : 'Pending'} />
        <DataPoint label="ASSIGNED REVIEWER" value={String(details.assignedReviewer || 'Unassigned')} />
        <DataPoint label="DOCUMENTS" value={documents.length ? `${documents.length} attached` : 'No documents attached'} />
      </div>
      {!!documents.length && <div className="approval-document-list">{documents.map((document, index) => <div key={String(document.id || index)}><ReceiptText /><span><strong>{String(document.originalName || document.role || 'KYC document')}</strong><small>{String(document.role || 'EVIDENCE').replaceAll('_', ' ')} · {String(document.contentType || 'file')}</small></span></div>)}</div>}
      {!!(details.extractedData || details.screeningSummary) && <div className="approval-machine-evidence">
        {details.extractedData != null && <div><span>EXTRACTED DOCUMENT DATA</span><pre>{JSON.stringify(details.extractedData, null, 2)}</pre></div>}
        {details.screeningSummary != null && <div><span>SCREENING SUMMARY</span><pre>{JSON.stringify(details.screeningSummary, null, 2)}</pre></div>}
      </div>}
    </div>;
  };
  return (
    <section className="module-workspace">
      <ModuleHeader eyebrow="GOVERNANCE / MAKER-CHECKER" title="Approval center" copy={`Review operational changes as ${profile.username || 'administrator'} with immutable maker-checker attribution.`} action="Refresh queue" onAction={() => void load()} />
      {message && <OperationNotice tone={/approved|rejected/i.test(message) ? 'success' : 'error'} message={message} />}
      <div className="panel operational-table">
        <table><thead><tr><th>REQUEST</th><th>RESOURCE</th><th>ACTION</th><th>MAKER</th><th>CREATED</th><th>REVIEW</th></tr></thead><tbody>
          {!requests.length && <EmptyRow columns={6} message="The approval queue is clear." />}
          {requests.map((row) => {
            const isMaker = row.maker.trim().toLowerCase() ===
              String(profile.username || '').trim().toLowerCase();
            return (
              <tr key={`${row.kind}:${row.id}`}>
                <td><span className="table-code">{row.kind === 'pricing-flow' ? 'PR-' : row.kind === 'treasury-funding' ? 'TF-' : row.kind === 'kyc' ? 'KYC-' : '#'}{row.id}</span></td>
                <td><div className="primary-cell"><strong>{row.resource}</strong><small>{row.resourceKey}</small>{row.evidenceDocumentId && <button className="table-link" onClick={() => void downloadEvidence(row)}>DOWNLOAD BANK DOCUMENT</button>}</div></td>
                <td>{row.action}</td>
                <td>{row.maker}</td>
                <td>{formatDate(row.createdAt)}</td>
                <td><div className="row-actions"><button onClick={() => void openReview(row)}>VIEW DETAILS</button>{isMaker && <span className="table-code">MAKER</span>}</div></td>
              </tr>
            );
          })}
        </tbody></table>
      </div>
      {reviewRequest && <div className="record-drawer approval-review-drawer">
        <button className="drawer-scrim" onClick={() => !decisionSubmitting && setReviewRequest(null)} aria-label="Close approval details" />
        <aside>
          <div className="drawer-head"><div><span>CHECKER REVIEW / {reviewRequest.kind.replaceAll('-', ' ').toUpperCase()}</span><h2>{reviewRequest.resource}</h2></div><button className="icon-button" disabled={decisionSubmitting} onClick={() => setReviewRequest(null)} aria-label="Close approval details"><X /></button></div>
          <div className="approval-review-identity">
            <span className="table-code">{reviewRequest.kind === 'pricing-flow' ? 'PR-' : reviewRequest.kind === 'treasury-funding' ? 'TF-' : reviewRequest.kind === 'kyc' ? 'KYC-' : '#'}{reviewRequest.id}</span>
            <strong>{reviewRequest.action}</strong>
            <small>Submitted {formatDate(reviewRequest.createdAt)} by {reviewRequest.maker}</small>
          </div>
          {reviewLoading ? <div className="drawer-loading"><LoaderCircle className="spin" /> Loading the complete approval evidence…</div> : renderApprovalReviewContent(reviewRequest, () => void downloadEvidence(reviewRequest))}
          <div className="approval-maker-note"><span>MAKER EXPLANATION</span><p>{reviewRequest.makerComment || 'No maker comment was provided.'}</p></div>
          {reviewIsMaker ? (
            <div className="treasury-warning"><ShieldCheck /> You created this request. A different checker must review and decide it.</div>
          ) : (
            <div className="approval-decision-panel">
              <label>CHECKER COMMENT / REJECTION REASON<textarea rows={4} value={decisionComment} onChange={(event) => setDecisionComment(event.target.value)} placeholder="Record what you verified. A reason is mandatory when rejecting." /></label>
              <div><button className="approval-reject" disabled={decisionSubmitting} onClick={() => void decide(reviewRequest, 'reject')}>{decisionSubmitting ? <LoaderCircle className="spin" /> : <X />} REJECT CHANGE</button><button className="approval-approve" disabled={decisionSubmitting || reviewLoading} onClick={() => void decide(reviewRequest, 'approve')}>{decisionSubmitting ? <LoaderCircle className="spin" /> : <Check />} APPROVE CHANGE</button></div>
            </div>
          )}
        </aside>
      </div>}
    </section>
  );
}

function CommandPalette({ profile, onClose, onNavigate }: { profile: AdminProfile; onClose: () => void; onNavigate: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const commands = navigation
    .flatMap((group) => group.items)
    .filter((item) => canSeeNavigationItem(item, profile));
  const filtered = commands.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="palette-layer" role="dialog" aria-modal="true" aria-label="Command palette">
      <button className="palette-backdrop" onClick={onClose} aria-label="Close command palette" />
      <div className="command-palette">
        <div className="palette-input"><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search modules or execute a command…" /><kbd>ESC</kbd></div>
        <div className="palette-label">AVAILABLE COMMANDS</div>
        <div className="palette-results">
          {filtered.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} onClick={() => onNavigate(item.id)}><span><Icon /></span><div><strong>Open {item.label}</strong><small>Navigate to operational workspace</small></div><ChevronRight /></button>;
          })}
          {!filtered.length && <div className="palette-empty">No command matched “{query}”.</div>}
        </div>
        <footer><span><kbd>↵</kbd> SELECT</span><span><kbd>ESC</kbd> CLOSE</span><strong>FINIFY COMMAND</strong></footer>
      </div>
    </div>
  );
}

function NotificationPanel() {
  return (
    <div className="notification-panel">
      <div><span>SECURITY SIGNALS</span><strong>All clear</strong></div>
      <p><ShieldCheck /> No critical alerts or approval escalations require attention.</p>
      <button>OPEN SECURITY CENTER <ArrowRight /></button>
    </div>
  );
}

function WalletBalanceSummary({
  label,
  balances,
  loading,
}: {
  label: string;
  balances: WalletBalanceGroup[];
  loading: boolean;
}) {
  return (
    <div className="wallet-balance-card">
      <span>{label}</span>
      {loading ? (
        <strong>—</strong>
      ) : balances.length ? (
        <div>
          {balances.map((balance) => (
            <strong key={balance.currency}>
              {formatMoney(balance.balance, balance.currency)}
              <small>{formatInteger(balance.walletCount)} wallets</small>
            </strong>
          ))}
        </div>
      ) : (
        <strong>NO WALLETS</strong>
      )}
    </div>
  );
}

function SystemWalletTable({ wallets, loading }: { wallets: SystemWalletRow[]; loading: boolean }) {
  return (
    <div className="data-table-wrap system-wallet-table">
      <table className="data-table">
        <thead><tr><th>SYSTEM WALLET</th><th>PURPOSE</th><th>CURRENCY</th><th>BALANCE</th><th>STATE</th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan={5}><span className="table-loading"><LoaderCircle className="spin" /> Synchronizing treasury balances…</span></td></tr>}
          {!loading && !wallets.length && <tr><td colSpan={5}><span className="table-loading">No system wallets are configured.</span></td></tr>}
          {!loading && wallets.map((wallet) => (
            <tr key={wallet.walletId}>
              <td><div className="wallet-identity"><span><Landmark /></span><div><strong>{wallet.walletName}</strong><small>{maskIdentifier(wallet.walletId)} · CODE {wallet.walletCode}</small></div></div></td>
              <td><span className="table-code">{wallet.purpose}</span></td>
              <td>{wallet.currency}</td>
              <td className="numeric">{formatMoney(wallet.balance, wallet.currency)}</td>
              <td><span className={`state-pill ${Number(wallet.status) === 0 ? 'active' : 'restricted'}`}><i />{Number(wallet.status) === 0 ? 'ACTIVE' : 'RESTRICTED'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OperationNotice({ tone, message }: { tone: 'success' | 'error'; message: string }) {
  return <div className={`operation-notice ${tone}`}>{tone === 'success' ? <CheckCircle2 /> : <AlertTriangle />}<span>{message}</span></div>;
}

function LoadingRow({ columns }: { columns: number }) {
  return <tr><td colSpan={columns}><span className="table-loading"><LoaderCircle className="spin" /> Synchronizing operational data…</span></td></tr>;
}

function EmptyRow({ columns, message }: { columns: number; message: string }) {
  return <tr><td colSpan={columns}><span className="table-loading">{message}</span></td></tr>;
}

function StatusPill({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const active = ['ACTIVE', 'APPROVED', 'COMPLETED', 'RESERVED', 'CLEARED', 'CLOSED'].includes(normalized);
  const pending = normalized.startsWith('PENDING')
    || ['DRAFT', 'IN_REVIEW', 'RUNNING', 'SUBMITTED'].includes(normalized);
  return <span className={`state-pill ${active ? 'active' : pending ? 'pending' : 'restricted'}`}><i />{normalized}</span>;
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return <div className="data-point"><span>{label}</span><strong>{value}</strong></div>;
}

function approvalValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(approvalValue).join(', ') : 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function humanizeApprovalField(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toUpperCase();
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`obsidian-brand ${compact ? 'compact' : ''}`}>
      <span className="obsidian-symbol"><i /><b /></span>
      {!compact && <div><strong>FINIFY</strong><small>COMMAND</small></div>}
    </div>
  );
}

function DarkField({
  label,
  value,
  placeholder,
  onChange,
  icon,
  type = 'text',
  action,
  autoComplete = 'off',
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  icon: ReactNode;
  type?: string;
  action?: ReactNode;
  autoComplete?: string;
}) {
  const id = label.toLowerCase().replace(/\s/g, '-');
  return (
    <label className="dark-field" htmlFor={id}>
      <span>{label}</span>
      <div>{icon}<input id={id} value={value} type={type} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} />{action}</div>
    </label>
  );
}

function SetupStage({ icon, kicker, title, copy, children }: { icon: ReactNode; kicker: string; title: ReactNode; copy: string; children: ReactNode }) {
  return <div className="setup-stage-content"><span className="setup-stage-icon">{icon}</span><p className="mono-kicker">{kicker}</p><h2>{title}</h2><p className="form-intro">{copy}</p>{children}</div>;
}

function IntegrityRow({ icon, label, detail, state }: { icon: ReactNode; label: string; detail: string; state: 'ok' | 'error' | 'idle' }) {
  return <div className="integrity-row"><span>{icon}</span><div><strong>{label}</strong><small>{detail}</small></div><i className={state}>{state === 'ok' ? <Check /> : state === 'error' ? '!' : '—'}</i></div>;
}

function Telemetry({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'AD';
  return <span className={`avatar ${small ? 'small' : ''}`}>{letters}<i /></span>;
}

function MetricCard({ icon, label, value, change, tone }: { icon: ReactNode; label: string; value: string; change: string; tone: string }) {
  return <div className={`metric-card ${tone}`}><div className="metric-top"><span>{icon}</span><Activity /></div><p>{label}</p><strong>{value}</strong><small><TrendingUp /> {change}</small></div>;
}

function PanelHead({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="panel-head"><div><span>{eyebrow}</span><h2>{title}</h2></div>{action && <button onClick={onAction}>{action} <ArrowRight /></button>}</div>;
}

function PipelineNode({ icon, label, detail, state }: { icon: ReactNode; label: string; detail: string; state: string }) {
  return <div className={`pipeline-node ${state}`}><span>{icon}<i /></span><strong>{label}</strong><small>{detail}</small></div>;
}

function PipelineConnector() {
  return <span className="pipeline-connector"><i /></span>;
}

function ControlItem({ label, value }: { label: string; value: string }) {
  return <div className="control-item"><span><Check /></span><strong>{label}</strong><small>{value}</small></div>;
}

function QuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick}><span>{icon}</span><strong>{label}</strong><ChevronRight /></button>;
}

function ModuleHeader({ eyebrow, title, copy, action, onAction }: { eyebrow: string; title: string; copy: string; action: string; onAction?: () => void }) {
  return <header className="module-header"><div><p className="mono-kicker">{eyebrow}</p><h1>{title}</h1><span>{copy}</span></div><button className="command-button small" onClick={onAction}><Zap /> {action.toUpperCase()}</button></header>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="mini-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function RuleNode({ index, source, title, condition, result, accent = false }: { index: string; source: string; title: string; condition: string; result: string; accent?: boolean }) {
  return <div className={`rule-node ${accent ? 'accent' : ''}`}><span className="rule-index">{index}</span><div><small>{source}</small><strong>{title}</strong><code>{condition}</code></div><span className="rule-result"><i />{result}</span></div>;
}

function formatInteger(value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat('en-GB').format(value);
}

function formatMoney(value: number | string, currency = 'GBP') {
  const numeric = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP', maximumFractionDigits: 2 }).format(numeric);
  } catch {
    return `${currency || ''} ${numeric.toFixed(2)}`.trim();
  }
}

function formatWalletBalances(balances?: WalletBalanceGroup[]) {
  if (!Array.isArray(balances) || !balances.length) return 'No wallet balance';
  return balances
    .map((balance) => formatMoney(balance.balance, balance.currency))
    .join(' · ');
}

function maskIdentifier(value?: string) {
  if (!value) return '—';
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}•••${value.slice(-3)}`;
}

function customerStatus(value: number) {
  return ({ 0: 'ACTIVE', 1: 'SUSPENDED', 2: 'BLOCKED', 6: 'CLOSED' } as Record<number, string>)[Number(value)] || 'RESTRICTED';
}

function kycStatusLabel(value?: number) {
  return ({ 0: 'PENDING', 1: 'VERIFIED', 2: 'REJECTED' } as Record<number, string>)[Number(value)] || 'NOT STARTED';
}

function walletStatus(value: number) {
  return ({ 0: 'ACTIVE', 1: 'SUSPENDED', 2: 'FROZEN', 6: 'CLOSED' } as Record<number, string>)[Number(value)] || 'RESTRICTED';
}

function formatDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function conditionSummary(value: unknown) {
  if (!value || typeof value !== 'object') return 'No condition';
  const condition = value as Record<string, unknown>;
  return `${String(condition.operator || 'GROUP').split('_').join(' ')} ${String(condition.value ?? condition.lowerValue ?? '')}`.trim();
}

function actionSummary(value: unknown) {
  if (!value || typeof value !== 'object') return 'CONTINUE';
  const action = value as Record<string, unknown>;
  return action.limit !== undefined ? `${String(action.limit)} LIMIT` : String(action.type || 'CONTINUE').split('_').join(' ');
}
