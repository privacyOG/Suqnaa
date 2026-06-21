import { NextRequest, NextResponse } from 'next/server';
import {
  isSameOriginMutation,
  maximumRefreshTokenLength,
  parseWebSessionCredentials,
  refreshCookieName,
  setWebSessionCookies,
  validToken
} from '../../../../lib/web-session';

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }

  const refreshToken = request.cookies.get(refreshCookieName)?.value;
  if (!validToken(refreshToken, maximumRefreshTokenLength)) {
    return NextResponse.json({ error: 'Refresh session unavailable' }, { status: 401 });
  }

  let apiResponse: Response;
  try {
    apiResponse = await fetch(`${apiBaseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': request.headers.get('user-agent') ?? 'SuqnaaWeb/1.0'
      },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store'
    });
  } catch {
    return NextResponse.json(
      { error: 'Session service unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!apiResponse.ok) {
    const response = NextResponse.json(
      { error: apiResponse.status === 429 ? 'Too many refresh attempts' : 'Refresh session rejected' },
      { status: apiResponse.status === 429 ? 429 : apiResponse.status === 401 ? 401 : 502 }
    );
    response.headers.set('Cache-Control', 'no-store');

    const retryAfter = apiResponse.headers.get('retry-after');
    if (retryAfter) {
      response.headers.set('Retry-After', retryAfter);
    }

    return response;
  }

  let payload: unknown;
  try {
    payload = await apiResponse.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid refresh response' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const credentials = parseWebSessionCredentials(payload);
  if (!credentials) {
    return NextResponse.json(
      { error: 'Invalid refresh response' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const response = NextResponse.json({ refreshed: true });
  response.headers.set('Cache-Control', 'no-store');
  setWebSessionCookies(response, credentials);
  return response;
}
