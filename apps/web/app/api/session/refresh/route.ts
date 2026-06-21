import { NextRequest, NextResponse } from 'next/server';
import { rotateServerSession } from '../../../../lib/server-session-rotation';
import {
  isSameOriginMutation,
  refreshCookieName,
  setWebSessionCookies
} from '../../../../lib/web-session';

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }

  const rotation = await rotateServerSession(
    request.cookies.get(refreshCookieName)?.value,
    request.headers.get('user-agent')
  );

  if (!rotation.ok) {
    const response = NextResponse.json(
      { error: rotation.error },
      { status: rotation.status }
    );
    response.headers.set('Cache-Control', 'no-store');
    if (rotation.retryAfter) {
      response.headers.set('Retry-After', rotation.retryAfter);
    }
    return response;
  }

  const response = NextResponse.json({ refreshed: true });
  response.headers.set('Cache-Control', 'no-store');
  setWebSessionCookies(response, rotation.credentials);
  return response;
}
