function cookie(name: string) {
  if (typeof document === 'undefined') return '';
  const prefix = `${name}=`;
  const value = document.cookie.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : '';
}

export function sessionFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.delete('authorization');
  const method = String(init.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = cookie('finify_customer_csrf');
    if (csrf) headers.set('x-csrf-token', csrf);
  }
  return fetch(input, { ...init, headers, credentials: 'include' });
}

