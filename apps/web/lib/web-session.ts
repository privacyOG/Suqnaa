import type { NextResponse } from 'next/server';

export const accessCookieName = 'suqnaa_access';
export const refreshCookieName = 'suqnaa_refresh';
export const maximumAccessTokenLength = 4096;
export const maximumRefreshTokenLength = 512;

export interface WebSessionCredentials {
  accessToken: string;
  refreshToken: string;
}

export function validToken(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength;
}

export function parseWebSessionCredentials(value: unknown): WebSessionCredentials | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const session = record.session;
  if (typeof session !== 'object' || session === null || Array.isArray(session)) {
    return null;
  }

  const sessionRecord = session as Record<string, unknown>;
  if (
    !validToken(record.accessToken, maximumAccessTokenLength) ||
    !validToken(sessionRecord.refreshToken, maximumRefreshTokenLength)
  ) {
    return null;
  }

  return {
    accessToken: record.accessToken,
    refreshToken: sessionRecord.refreshToken
  };
}

export function setWebSessionCookies(
  response: NextResponse,
  credentials: WebSessionCredentials
): void {
  const secure = process.env.NODE_ENV === 'production';

  response.cookies.set(accessCookieName, credentials.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60
  });
  response.cookies.set(refreshCookieName, credentials.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60
  });
}

export function clearWebSessionCookies(response: NextResponse): void {
  const secure = process.env.NODE_ENV === 'production';

  response.cookies.set(accessCookieName, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  response.cookies.set(refreshCookieName, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
}

export function isSameOriginMutation(
  request: Request,
  production = process.env.NODE_ENV === 'production'
): boolean {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin) {
    return origin === requestOrigin;
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) {
    return fetchSite === 'same-origin';
  }

  return !production;
}
