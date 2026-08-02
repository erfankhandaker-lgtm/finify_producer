const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/finify';

function cookie(name: string) {
  if (typeof document === 'undefined') return '';
  const prefix = `${name}=`;
  const value = document.cookie.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : '';
}

function secured(init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.delete('authorization');
  const method = String(init.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = cookie('finify_admin_csrf');
    if (csrf) headers.set('x-csrf-token', csrf);
  }
  return { ...init, headers, credentials: 'include' as const };
}

export async function sessionFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  let response = await fetch(input, secured(init));
  const target = String(input);
  if (response.status === 401 && !target.includes('/admin/auth/')) {
    const refreshed = await fetch(`${API_URL}/admin/auth/refresh`, secured({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }));
    if (refreshed.ok) response = await fetch(input, secured(init));
  }
  return response;
}

