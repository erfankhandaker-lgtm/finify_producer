import { ForbiddenException } from '@nestjs/common';
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_CSRF_COOKIE,
  assertCookieCsrf,
  browserSessionResponse,
  setAdminSessionCookies,
} from './session-cookie';

describe('HttpOnly session cookies and CSRF', () => {
  const originalNodeMode = process.env.NODE_MODE;

  afterEach(() => {
    if (originalNodeMode === undefined) delete process.env.NODE_MODE;
    else process.env.NODE_MODE = originalNodeMode;
  });

  it('sets access and refresh tokens as HttpOnly cookies', () => {
    const cookie = jest.fn();
    setAdminSessionCookies({ cookie } as any, 'access-token', 'refresh-token');
    expect(cookie).toHaveBeenCalledWith(
      'finify_admin_access',
      'access-token',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
    );
    expect(cookie).toHaveBeenCalledWith(
      'finify_admin_refresh',
      'refresh-token',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
    );
  });

  it('requires matching double-submit CSRF values for cookie mutations', () => {
    const request = {
      method: 'POST',
      headers: {
        cookie: `${ADMIN_ACCESS_COOKIE}=jwt; ${ADMIN_CSRF_COOKIE}=expected`,
        'x-csrf-token': 'wrong',
      },
    } as any;
    expect(() => assertCookieCsrf(request, ADMIN_ACCESS_COOKIE, ADMIN_CSRF_COOKIE))
      .toThrow(ForbiddenException);
    request.headers['x-csrf-token'] = 'expected';
    expect(() => assertCookieCsrf(request, ADMIN_ACCESS_COOKIE, ADMIN_CSRF_COOKIE))
      .not.toThrow();
  });

  it('keeps bearer API clients compatible without browser CSRF cookies', () => {
    const request = {
      method: 'POST',
      headers: { authorization: 'Bearer external-api-token' },
    } as any;
    expect(() => assertCookieCsrf(request, ADMIN_ACCESS_COOKIE, ADMIN_CSRF_COOKIE))
      .not.toThrow();
  });

  it('never returns customer or admin bearer tokens in a browser response', () => {
    expect(browserSessionResponse({
      token: 'customer-jwt',
      accessToken: 'admin-jwt',
      refreshToken: 'refresh-secret',
      profile: { id: 1 },
    })).toEqual({ authenticated: true, profile: { id: 1 } });
  });

  it('marks session cookies Secure when NODE_MODE is prod', () => {
    process.env.NODE_MODE = 'prod';
    const cookie = jest.fn();
    setAdminSessionCookies({ cookie } as any, 'access-token', 'refresh-token');
    expect(cookie).toHaveBeenCalledWith(
      ADMIN_ACCESS_COOKIE,
      'access-token',
      expect.objectContaining({ secure: true }),
    );
  });
});
