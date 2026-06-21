import { NextResponse } from 'next/server';

const accessCookieName = 'suqnaa_access';
const refreshCookieName = 'suqnaa_refresh';
const maximumAccessTokenLength = 4096;
const maximumRefreshTokenLength = 512;

interface SessionRequestBody {
  accessToken?: unknown;
  refreshToken?: unknown;
}

function validToken(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength;
}

export async function POST(request: Request) {
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
  const secure = process.env.NODE_ENV === 'production';

  response.cookies.set(accessCookieName, body.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60
  });
  response.cookies.set(refreshCookieName, body.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ cleared: true });
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

  return response;
}
