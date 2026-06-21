import { NextRequest, NextResponse } from 'next/server';
import {
  clearWebSessionCookies,
  isSameOriginMutation,
  maximumAccessTokenLength,
  maximumRefreshTokenLength,
  refreshCookieName,
  setWebSessionCookies,
  validToken
} from '../../../lib/web-session';

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

interface SessionRequestBody {
  accessToken?: unknown;
  refreshToken?: unknown;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }

  let body: SessionRequestBody;

  try {
    body = await request.json() as SessionRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid session payload' }, { status: 400 });
  }

  if (
    !validToken(body.accessToken, maximumAccessTokenLength) ||
    !validToken(body.refreshToken, maximumRefreshTokenLength)
  ) {
    return NextResponse.json({ error: 'Invalid session payload' }, { status: 400 });
  }

  const response = NextResponse.json({ established: true });
  response.headers.set('Cache-Control', 'no-store');
  setWebSessionCookies(response, {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }

  const refreshToken = request.cookies.get(refreshCookieName)?.value;

  if (refreshToken) {
    try {
      await fetch(`${apiBaseUrl}/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': request.headers.get('user-agent') ?? 'SuqnaaWeb/1.0'
        },
        body: JSON.stringify({ refreshToken }),
        cache: 'no-store'
      });
    } catch {
      // Local cookie removal must still complete if the API is temporarily unavailable.
    }
  }

  const response = NextResponse.json({ cleared: true });
  response.headers.set('Cache-Control', 'no-store');
  clearWebSessionCookies(response);
  return response;
}
