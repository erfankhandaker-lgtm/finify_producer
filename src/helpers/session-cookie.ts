import { ForbiddenException } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const ADMIN_ACCESS_COOKIE = 'finify_admin_access';
export const ADMIN_REFRESH_COOKIE = 'finify_admin_refresh';
export const ADMIN_CSRF_COOKIE = 'finify_admin_csrf';
export const CUSTOMER_ACCESS_COOKIE = 'finify_customer_access';
export const CUSTOMER_CSRF_COOKIE = 'finify_customer_csrf';

const production = () => ['prod', 'production'].includes(String(
  process.env.NODE_MODE || process.env.NODE_ENV || 'development',
).toLowerCase());

export function cookies(request: Request): Record<string, string> {
  return String(request.headers.cookie || '').split(';').reduce((values, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return values;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) values[key] = decodeURIComponent(value);
    return values;
  }, {} as Record<string, string>);
}

export function cookieToken(request: Request, name: string) {
  return cookies(request)[name] || null;
}

const baseOptions = (httpOnly: boolean, maxAge: number) => ({
  httpOnly,
  secure: production(),
  sameSite: 'strict' as const,
  path: '/',
  maxAge,
});

export function setAdminSessionCookies(
  response: Response,
  accessToken: string,
  refreshToken: string,
) {
  const csrf = randomBytes(32).toString('base64url');
  response.cookie(ADMIN_ACCESS_COOKIE, accessToken, baseOptions(true, 15 * 60 * 1000));
  response.cookie(ADMIN_REFRESH_COOKIE, refreshToken, baseOptions(true, 7 * 24 * 60 * 60 * 1000));
  response.cookie(ADMIN_CSRF_COOKIE, csrf, baseOptions(false, 7 * 24 * 60 * 60 * 1000));
}

export function clearAdminSessionCookies(response: Response) {
  for (const name of [ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE, ADMIN_CSRF_COOKIE]) {
    response.clearCookie(name, baseOptions(name !== ADMIN_CSRF_COOKIE, 0));
  }
}

export function setCustomerSessionCookies(response: Response, accessToken: string) {
  const csrf = randomBytes(32).toString('base64url');
  response.cookie(CUSTOMER_ACCESS_COOKIE, accessToken, baseOptions(true, 48 * 60 * 60 * 1000));
  response.cookie(CUSTOMER_CSRF_COOKIE, csrf, baseOptions(false, 48 * 60 * 60 * 1000));
}

export function clearCustomerSessionCookies(response: Response) {
  response.clearCookie(CUSTOMER_ACCESS_COOKIE, baseOptions(true, 0));
  response.clearCookie(CUSTOMER_CSRF_COOKIE, baseOptions(false, 0));
}

export function assertCookieCsrf(
  request: Request,
  accessCookie: string,
  csrfCookie: string,
) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return;
  if (request.headers.authorization) return;
  const values = cookies(request);
  if (!values[accessCookie]) return;
  const expected = Buffer.from(values[csrfCookie] || '', 'utf8');
  const supplied = Buffer.from(String(request.headers['x-csrf-token'] || ''), 'utf8');
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new ForbiddenException('A valid CSRF token is required');
  }
}

export function browserSessionResponse<T extends Record<string, unknown>>(value: T) {
  const {
    token: _token,
    accessToken: _accessToken,
    refreshToken: _refreshToken,
    ...safe
  } = value;
  return { ...safe, authenticated: true };
}
