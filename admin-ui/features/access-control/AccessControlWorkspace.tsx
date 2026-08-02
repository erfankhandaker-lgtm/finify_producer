'use client';

import {
  Camera,
  KeyRound,
  LockKeyhole,
  Plus,
  Search,
  ScanFace,
  ShieldCheck,
  Upload,
  UserCog,
  Users,
  VideoOff,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './AccessControlWorkspace.module.css';
import { sessionFetch } from '../../lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/finify';

type Permission = { id: string; code: string; resource: string; action: string; description?: string };
type Role = { id: string; code: string; name: string; description?: string; isSystem: boolean; userCount?: number; permissions: Permission[] };
type UserRole = { id: string; code: string; name: string; isSystem: boolean };
type AdminUser = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  status: string;
  lastLoginAt?: string;
  roles: UserRole[];
  biometricEnrolled: boolean;
  biometricEnabled: boolean;
  biometricEnrolledAt?: string;
  biometricLastVerifiedAt?: string;
  mfaEnabled: boolean;
  mfaEnrolledAt?: string;
  mfaRecoveryPinAvailable: boolean;
};
type Profile = { id?: string; roles?: string[]; permissions?: string[] };

const RESOURCE_LABELS: Record<string, string> = {
  pricing_rules: 'Charge & commission management',
  charges: 'Legacy charge API',
  commissions: 'Legacy commission API',
  admin_roles: 'Role management',
  admin_users: 'User management',
  credit_rules: 'Credit decision rules',
  aml: 'Risk & AML',
};

const PERMISSION_LABELS: Record<string, string> = {
  'pricing_rules.read': 'View pricing configurations',
  'pricing_rules.make': 'Create and change pricing configurations',
  'pricing_rules.check': 'Approve and activate pricing configurations',
  'pricing_rules.simulate': 'Simulate pricing configurations',
};

async function request<T>(route: string, token: string, init: { method?: string; body?: unknown } = {}) {
  const response = await sessionFetch(`${API_URL}${route}`, {
    method: init.method || 'GET',
    cache: 'no-store',
    headers: {
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = raw?.message || raw?.payload?.message || `Request failed (${response.status})`;
    throw new Error(Array.isArray(message) ? message.join(', ') : String(message));
  }
  return (raw?.payload ?? raw) as T;
}

export default function AccessControlWorkspace({
  token,
  profile,
}: {
  token: string;
  profile: Profile;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ type: 'user' | 'role'; value?: AdminUser | Role } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextUsers, nextRoles, nextPermissions] = await Promise.all([
        request<AdminUser[]>('/admin/access/users', token),
        request<Role[]>('/admin/access/roles', token),
        request<Permission[]>('/admin/access/permissions', token),
      ]);
      setUsers(nextUsers);
      setRoles(nextRoles);
      setPermissions(nextPermissions);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filteredUsers = users.filter((user) =>
    `${user.username} ${user.displayName} ${user.email} ${user.roles.map((role) => role.name).join(' ')}`
      .toLowerCase().includes(query.toLowerCase()),
  );
  const filteredRoles = roles.filter((role) =>
    `${role.code} ${role.name} ${role.description || ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const isSuperAdmin = profile.roles?.includes('super_admin') === true;

  return (
    <section className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <p>SECURITY / IDENTITY GOVERNANCE</p>
          <h1>User management</h1>
          <span>Create administrative roles, allocate precise privileges, and attach governed access profiles to portal users.</span>
        </div>
        <button
          className={styles.primary}
          disabled={!isSuperAdmin}
          title={isSuperAdmin ? undefined : 'Only a Super Admin can change users and roles'}
          onClick={() => setEditor({ type: tab === 'users' ? 'user' : 'role' })}
        >
          <Plus /> {tab === 'users' ? 'CREATE USER' : 'CREATE ROLE'}
        </button>
      </header>

      <div className={styles.metrics}>
        <Metric icon={<Users />} label="Administrators" value={String(users.length)} detail={`${users.filter((user) => user.status === 'active').length} active`} />
        <Metric icon={<UserCog />} label="Security roles" value={String(roles.length)} detail={`${roles.filter((role) => !role.isSystem).length} custom`} />
        <Metric icon={<KeyRound />} label="Privileges" value={String(permissions.length)} detail={`${new Set(permissions.map((item) => item.resource)).size} resources`} />
        <Metric icon={<LockKeyhole />} label="Control policy" value="ENFORCED" detail="Maker-checker active" />
      </div>

      <div className={styles.policy}>
        <ShieldCheck />
        <div>
          <strong>{isSuperAdmin ? 'Super Admin override is active for this session' : 'Maker-checker separation applies to this session'}</strong>
          <span>{isSuperAdmin ? 'You may review your own governed changes. Other administrators still require a different checker.' : 'A different authorized administrator must approve governed changes you create.'}</span>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.main}>
        <div className={styles.toolbar}>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${tab === 'users' ? styles.active : ''}`} onClick={() => setTab('users')}>USERS</button>
            <button className={`${styles.tab} ${tab === 'roles' ? styles.active : ''}`} onClick={() => setTab('roles')}>ROLES & PRIVILEGES</button>
          </div>
          <label className={styles.search}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${tab}…`} /></label>
        </div>

        {tab === 'users' ? (
          <table className={styles.table}>
            <thead><tr><th>ADMINISTRATOR</th><th>ROLES</th><th>AUTHENTICATOR MFA</th><th>STATUS</th><th>LAST LOGIN</th><th /></tr></thead>
            <tbody>
              {loading && <tr><td className={styles.empty} colSpan={6}>Synchronizing identity registry…</td></tr>}
              {!loading && !filteredUsers.length && <tr><td className={styles.empty} colSpan={6}>No administrators matched this view.</td></tr>}
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td><Identity name={user.displayName} username={user.username} email={user.email} /></td>
                  <td><div className={styles.chips}>{user.roles.map((role) => <span className={`${styles.chip} ${role.isSystem ? styles.system : ''}`} key={role.id}>{role.name}</span>)}</div></td>
                  <td><span className={`${styles.faceState} ${user.mfaEnabled ? styles.faceEnabled : ''}`}><ShieldCheck />{user.mfaEnabled ? 'ENFORCED' : 'ENROLMENT REQUIRED'}</span></td>
                  <td><span className={`${styles.status} ${styles[user.status] || ''}`}>{user.status}</span></td>
                  <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</td>
                  <td>{isSuperAdmin && <button className={styles.rowAction} onClick={() => setEditor({ type: 'user', value: user })}>MANAGE</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className={styles.table}>
            <thead><tr><th>ROLE</th><th>PRIVILEGES</th><th>ASSIGNED USERS</th><th>TYPE</th><th /></tr></thead>
            <tbody>
              {loading && <tr><td className={styles.empty} colSpan={5}>Synchronizing role catalogue…</td></tr>}
              {!loading && !filteredRoles.length && <tr><td className={styles.empty} colSpan={5}>No roles matched this view.</td></tr>}
              {filteredRoles.map((role) => (
                <tr key={role.id}>
                  <td><div className={styles.identity}><span className={styles.avatar}>{initials(role.name)}</span><div><strong>{role.name}</strong><small>{role.code}</small></div></div></td>
                  <td><div className={styles.chips}>{role.permissions.slice(0, 4).map((permission) => <span className={styles.chip} key={permission.id}>{permissionLabel(permission)}</span>)}{role.permissions.length > 4 && <span className={styles.chip}>+{role.permissions.length - 4}</span>}</div></td>
                  <td>{role.userCount || 0}</td>
                  <td><span className={`${styles.chip} ${role.isSystem ? styles.system : ''}`}>{role.isSystem ? 'SYSTEM' : 'CUSTOM'}</span></td>
                  <td>
                    {role.isSystem ? (
                      <span className={styles.protected} title="System roles are protected and cannot be edited">
                        <LockKeyhole /> PROTECTED
                      </span>
                    ) : isSuperAdmin ? (
                      <button className={styles.rowAction} onClick={() => setEditor({ type: 'role', value: role })}>EDIT ROLE</button>
                    ) : (
                      <span className={styles.readOnly}>READ ONLY</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editor && (
        <Editor
          editor={editor}
          token={token}
          roles={roles}
          permissions={permissions}
          currentUserId={profile.id}
          onClose={() => setEditor(null)}
          onSaved={async () => { setEditor(null); await load(); }}
          onBiometricChanged={load}
        />
      )}
    </section>
  );
}

function Editor({
  editor,
  token,
  roles,
  permissions,
  currentUserId,
  onClose,
  onSaved,
  onBiometricChanged,
}: {
  editor: { type: 'user' | 'role'; value?: AdminUser | Role };
  token: string;
  roles: Role[];
  permissions: Permission[];
  currentUserId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onBiometricChanged: () => Promise<void>;
}) {
  const editing = Boolean(editor.value);
  const user = editor.type === 'user' ? editor.value as AdminUser | undefined : undefined;
  const role = editor.type === 'role' ? editor.value as Role | undefined : undefined;
  const [form, setForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
    displayName: user?.displayName || '',
    password: '',
    status: user?.status || 'active',
    roleIds: user?.roles.map((item) => item.id) || [],
    code: role?.code || '',
    name: role?.name || '',
    description: role?.description || '',
    permissionIds: role?.permissions.map((item) => item.id) || [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const grouped = useMemo(() => {
    const result: Record<string, Permission[]> = {};
    permissions.forEach((permission) => {
      (result[permission.resource] ||= []).push(permission);
    });
    return result;
  }, [permissions]);

  const toggle = (key: 'roleIds' | 'permissionIds', id: string) => {
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(id)
        ? current[key].filter((value) => value !== id)
        : [...current[key], id],
    }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (editor.type === 'role') {
        const body = {
          ...(editing ? {} : { code: form.code }),
          name: form.name,
          description: form.description,
          permissionIds: form.permissionIds,
        };
        await request(
          editing ? `/admin/access/roles/${role!.id}` : '/admin/access/roles',
          token,
          { method: editing ? 'PATCH' : 'POST', body },
        );
      } else {
        const body = editing
          ? {
              email: form.email,
              displayName: form.displayName,
              status: form.status,
              roleIds: form.roleIds,
              ...(form.password ? { password: form.password } : {}),
            }
          : {
              username: form.username,
              email: form.email,
              displayName: form.displayName,
              password: form.password,
              roleIds: form.roleIds,
            };
        await request(
          editing ? `/admin/access/users/${user!.id}` : '/admin/access/users',
          token,
          { method: editing ? 'PATCH' : 'POST', body },
        );
      }
      await onSaved();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button className={styles.backdrop} onClick={onClose} aria-label="Close editor" />
      <aside className={styles.drawer}>
        <div className={styles.drawerHead}>
          <div><span className={styles.eyebrow}>IDENTITY GOVERNANCE</span><h2>{editing ? 'Manage' : 'Create'} {editor.type}</h2><p>{editor.type === 'role' ? 'Compose a least-privilege access profile.' : 'Attach one or more governed roles to an administrator.'}</p></div>
          <button className={styles.iconButton} onClick={onClose}><X /></button>
        </div>

        <div className={styles.form}>
          {editor.type === 'user' ? (
            <>
              <div className={styles.split}>
                <Field label="Username"><input disabled={editing} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></Field>
                <Field label="Status"><select disabled={user?.id === currentUserId} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="disabled">Disabled</option><option value="locked">Locked</option></select></Field>
              </div>
              <Field label="Display name"><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></Field>
              <Field label="Email"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
              <Field label={editing ? 'New password (optional)' : 'Temporary password'}><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Minimum 12 characters" /></Field>
              <div className={styles.selector}>
                <div className={styles.selectorHead}><span>Assigned roles</span><span>{form.roleIds.length} selected</span></div>
                <div className={styles.group}>
                  {roles.map((item) => <CheckOption key={item.id} checked={form.roleIds.includes(item.id)} title={item.name} detail={item.description || item.code} onChange={() => toggle('roleIds', item.id)} />)}
                </div>
              </div>
              {editing && user && (
                <MfaManagement token={token} user={user} onChanged={onBiometricChanged} />
              )}
            </>
          ) : (
            <>
              <Field label="Role code"><input disabled={editing} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="operations_maker" /></Field>
              <Field label="Role name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Operations maker" /></Field>
              <Field label="Description"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
              <div className={styles.selector}>
                <div className={styles.selectorHead}><span>Privilege matrix</span><span>{form.permissionIds.length} selected</span></div>
                {Object.entries(grouped).map(([resource, items]) => (
                  <div className={styles.group} key={resource}>
                    <strong>{resourceLabel(resource)}</strong>
                    {items.map((permission) => <CheckOption key={permission.id} checked={form.permissionIds.includes(permission.id)} title={permissionLabel(permission)} detail={permission.description || permission.code} onChange={() => toggle('permissionIds', permission.id)} />)}
                  </div>
                ))}
              </div>
            </>
          )}
          {error && <div className={styles.error}>{error}</div>}
        </div>
        <div className={styles.drawerFooter}>
          <button className={styles.secondary} onClick={onClose}>CANCEL</button>
          <button className={styles.primary} disabled={saving} onClick={() => void save()}>{saving ? 'SAVING…' : 'SAVE ACCESS'}</button>
        </div>
      </aside>
    </>
  );
}

function MfaManagement({ token, user, onChanged }: { token: string; user: AdminUser; onChanged: () => Promise<void> }) {
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState('');
  const reset = async () => {
    if (!window.confirm(`Reset authenticator MFA for ${user.displayName}? All active sessions will be revoked and the user must enrol again.`)) return;
    setResetting(true); setMessage('');
    try {
      await request(`/admin/access/users/${user.id}/mfa/reset`, token, { method: 'POST' });
      setMessage('MFA reset. The user must scan a new authenticator QR code at next login.');
      await onChanged();
    } catch (error) { setMessage((error as Error).message); }
    finally { setResetting(false); }
  };
  return (
    <section className={styles.biometricPanel}>
      <div className={styles.biometricHead}>
        <span className={styles.biometricIcon}><ShieldCheck /></span>
        <div><strong>Authenticator MFA</strong><small>TOTP + single-use recovery PIN</small></div>
        <span className={`${styles.faceState} ${user.mfaEnabled ? styles.faceEnabled : ''}`}>{user.mfaEnabled ? 'ACTIVE' : 'REQUIRED'}</span>
      </div>
      <div className={styles.biometricActions}>
        <button type="button" className={styles.secondary} disabled={!user.mfaEnabled || resetting} onClick={() => void reset()}><KeyRound />{resetting ? 'RESETTING…' : 'RESET AUTHENTICATOR'}</button>
      </div>
      {message && <div className={styles.biometricMessage}><ShieldCheck />{message}</div>}
      <p className={styles.biometricNotice}>{user.mfaEnabled ? `Enrolled ${user.mfaEnrolledAt ? new Date(user.mfaEnrolledAt).toLocaleString() : ''}. Recovery PIN ${user.mfaRecoveryPinAvailable ? 'is available' : 'has been consumed'}.` : 'At next login, the user will scan a QR code and receive a one-time recovery PIN. Face sign-in is disabled.'}</p>
    </section>
  );
}

function BiometricEnrollment({
  token,
  user,
  onChanged,
}: {
  token: string;
  user: AdminUser;
  onChanged: () => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [candidate, setCandidate] = useState<File | null>(null);
  const [candidateUrl, setCandidateUrl] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceRevision, setReferenceRevision] = useState(0);
  const [enrolled, setEnrolled] = useState(Boolean(user.biometricEnrolled));
  const [enabled, setEnabled] = useState(Boolean(user.biometricEnabled));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOpen || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch((playError) => {
      setError(cameraAccessMessage(playError));
      stopCamera();
    });
  }, [cameraOpen, stopCamera]);
  useEffect(() => () => { if (candidateUrl) URL.revokeObjectURL(candidateUrl); }, [candidateUrl]);

  useEffect(() => {
    if (!enrolled) return;
    let active = true;
    let url = '';
    void sessionFetch(`${API_URL}/admin/access/users/${user.id}/biometric/photo`, {
      cache: 'no-store',
    }).then(async (response) => {
      if (!response.ok) return;
      url = URL.createObjectURL(await response.blob());
      if (active) setReferenceUrl(url);
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [enrolled, referenceRevision, token, user.id]);

  const startCamera = async () => {
    setError('');
    setMessage('');
    try {
      if (!window.isSecureContext) {
        throw new DOMException('Camera requires a secure page', 'SecurityError');
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new DOMException('Camera API is unavailable', 'NotSupportedError');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 900 }, height: { ideal: 900 } },
      });
      if (!stream.getVideoTracks().some((track) => track.readyState === 'live')) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException('No live camera track was returned', 'NotReadableError');
      }
      streamRef.current = stream;
      setCameraOpen(true);
    } catch (cameraError) {
      setError(cameraAccessMessage(cameraError));
    }
  };

  const selectCandidate = (file: File) => {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Choose a JPEG or PNG image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('The portrait must not exceed 5 MB.');
      return;
    }
    setCandidate(file);
    setCandidateUrl(URL.createObjectURL(file));
    setError('');
    setMessage('Portrait ready for KYC face validation.');
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) {
      setError('The camera is still preparing. Try again in a moment.');
      return;
    }
    const canvas = document.createElement('canvas');
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d')?.drawImage(
      video,
      (video.videoWidth - size) / 2,
      (video.videoHeight - size) / 2,
      size,
      size,
      0,
      0,
      size,
      size,
    );
    canvas.toBlob((blob) => {
      if (blob) selectCandidate(new File([blob], `admin-${user.id}-portrait.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', .92);
    stopCamera();
  };

  const enroll = async () => {
    if (!candidate) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const body = new FormData();
      body.append('image', candidate);
      const response = await sessionFetch(`${API_URL}/admin/access/users/${user.id}/biometric`, {
        method: 'POST',
        body,
      });
      const raw = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(raw?.message || 'The portrait could not be enrolled.');
      setEnrolled(true);
      setEnabled(false);
      setCandidate(null);
      setCandidateUrl('');
      setReferenceRevision((current) => current + 1);
      setMessage('KYC face validation passed. Review and enable face sign-in below.');
      await onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The portrait could not be enrolled.');
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async () => {
    setBusy(true);
    setError('');
    try {
      await request(`/admin/access/users/${user.id}/biometric`, token, {
        method: 'PATCH',
        body: { enabled: !enabled },
      });
      setEnabled(!enabled);
      setMessage(!enabled ? 'Face sign-in is now active for this administrator.' : 'Face sign-in has been disabled.');
      await onChanged();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <section className={styles.biometricPanel}>
      <div className={styles.biometricHead}>
        <span className={styles.biometricIcon}><ScanFace /></span>
        <div><strong>Secure face sign-in</strong><small>KYC one-to-one face verification</small></div>
        <span className={`${styles.faceState} ${enabled ? styles.faceEnabled : ''}`}>{enabled ? 'ACTIVE' : enrolled ? 'ENROLLED' : 'NOT SET'}</span>
      </div>

      <div className={styles.portraitStage}>
        {candidateUrl || referenceUrl ? (
          <img src={candidateUrl || referenceUrl} alt={`${user.displayName} biometric reference`} />
        ) : (
          <div className={styles.portraitEmpty}><VideoOff /><span>No reference portrait enrolled</span></div>
        )}
        <span className={styles.privateBadge}><LockKeyhole /> PRIVATE</span>
      </div>

      <div className={styles.biometricActions}>
        <button type="button" className={styles.secondary} onClick={() => void startCamera()}><Camera /> OPEN CAMERA</button>
        <label className={styles.uploadButton}><Upload /> UPLOAD<input type="file" accept="image/jpeg,image/png" onChange={(event) => event.target.files?.[0] && selectCandidate(event.target.files[0])} /></label>
      </div>
      {candidate && <button type="button" className={styles.enrollButton} disabled={busy} onClick={() => void enroll()}>{busy ? 'VALIDATING FACE…' : 'VALIDATE & ENROL PORTRAIT'}</button>}
      {enrolled && !candidate && <button type="button" className={enabled ? styles.disableFace : styles.enableFace} disabled={busy} onClick={() => void toggleEnabled()}><ShieldCheck /> {enabled ? 'DISABLE FACE SIGN-IN' : 'ENABLE FACE SIGN-IN'}</button>}
      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.biometricMessage}><ShieldCheck />{message}</div>}
      <p className={styles.biometricNotice}>Reference portraits are held in private object storage. Login captures are used once for KYC face matching and immediately deleted. Password sign-in remains available for recovery.</p>
    </section>
    {cameraOpen && (
      <div className={styles.cameraModalBackdrop} role="dialog" aria-modal="true" aria-label="Capture administrator portrait">
        <div className={styles.cameraModal}>
          <header>
            <div><span>SECURE BIOMETRIC ENROLMENT</span><h3>Position your face</h3><p>Look directly into the camera and keep your face inside the guide.</p></div>
            <button type="button" className={styles.iconButton} onClick={stopCamera} aria-label="Close camera"><X /></button>
          </header>
          <div className={styles.cameraModalViewport}>
            <video ref={videoRef} playsInline muted />
            <span className={styles.faceGuide} />
            <span className={styles.cameraCorners} />
            <span className={styles.cameraLive}><i /> LIVE / PRIVATE</span>
          </div>
          <div className={styles.cameraChecklist}><span><ShieldCheck /> One face only</span><span><ShieldCheck /> Even lighting</span><span><ShieldCheck /> No hat or sunglasses</span></div>
          <footer><button type="button" className={styles.secondary} onClick={stopCamera}>CANCEL</button><button type="button" className={styles.primary} onClick={capture}><Camera /> CAPTURE PORTRAIT</button></footer>
        </div>
      </div>
    )}
    </>
  );
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <div className={styles.metric}>{icon}<span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Identity({ name, username, email }: { name: string; username: string; email: string }) {
  return <div className={styles.identity}><span className={styles.avatar}>{initials(name)}</span><div><strong>{name}</strong><small>@{username} · {email}</small></div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

function CheckOption({ checked, title, detail, onChange }: { checked: boolean; title: string; detail: string; onChange: () => void }) {
  return <label className={styles.option}><input type="checkbox" checked={checked} onChange={onChange} /><span><strong>{title}</strong><small>{detail}</small></span></label>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((item) => item[0]).join('').toUpperCase() || 'AD';
}

function resourceLabel(resource: string) {
  return RESOURCE_LABELS[resource] || resource.replaceAll('_', ' ');
}

function permissionLabel(permission: Permission) {
  return PERMISSION_LABELS[permission.code]
    || `${permission.action.replaceAll('_', ' ')} ${resourceLabel(permission.resource)}`;
}

function cameraAccessMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'SecurityError' || name === 'NotSupportedError') {
    return 'Camera access requires HTTPS or http://localhost:3100. Open the admin portal using localhost, then try again.';
  }
  if (name === 'NotAllowedError') {
    return 'Camera permission is blocked. Allow Camera for this site in the browser and in macOS System Settings → Privacy & Security → Camera, then retry.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No compatible camera was detected. Connect or enable a camera, then retry.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The camera is unavailable or already in use by another application. Close other camera apps and retry.';
  }
  return 'The camera could not be started. Check browser camera permission and retry.';
}
