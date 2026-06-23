import { NextRequest, NextResponse } from 'next/server';
import { rotateServerSession } from '../../../../lib/server-session-rotation';
import {
  accessCookieName,
  clearWebSessionCookies,
  isSameOriginMutation,
  refreshCookieName,
  setWebSessionCookies,
  type WebSessionCredentials
} from '../../../../lib/web-session';

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: {
    listingId: string;
  };
}

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { listingId } = context.params;

  if (!uuidPattern.test(listingId)) {
    return errorResponse('Invalid listing ID', 400);
  }

  if (!isSameOriginMutation(request)) {
    return errorResponse('Origin not allowed', 403);
  }

  const userAgent = request.headers.get('user-agent');
  const refreshToken = request.cookies.get(refreshCookieName)?.value;
  let accessToken = request.cookies.get(accessCookieName)?.value;
  let rotatedCredentials: WebSessionCredentials | undefined;

  if (!accessToken) {
    const rotation = await rotateServerSession(refreshToken, userAgent);
    if (!rotation.ok) {
      const response = errorResponse(rotation.error, rotation.status);
      if (rotation.status === 401) {
        clearWebSessionCookies(response);
      }
      return response;
    }
    rotatedCredentials = rotation.credentials;
    accessToken = rotation.credentials.accessToken;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse('Invalid form data', 400);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return errorResponse('No file provided', 400);
  }

  const forwardForm = new FormData();
  forwardForm.append('file', file, file.name);

  let apiResponse: Response;
  try {
    apiResponse = await fetch(
      `${apiBaseUrl}/v1/listings/${encodeURIComponent(listingId)}/media`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'user-agent': userAgent ?? 'SuqnaaWeb/1.0'
        },
        body: forwardForm,
        cache: 'no-store'
      }
    );
  } catch {
    const response = errorResponse('Marketplace service unavailable', 503);
    if (rotatedCredentials) {
      setWebSessionCookies(response, rotatedCredentials);
    }
    return response;
  }

  if (apiResponse.status === 401 && !rotatedCredentials) {
    const rotation = await rotateServerSession(refreshToken, userAgent);
    if (!rotation.ok) {
      const response = errorResponse(rotation.error, rotation.status);
      if (rotation.status === 401) {
        clearWebSessionCookies(response);
      }
      return response;
    }
    rotatedCredentials = rotation.credentials;

    try {
      const retryForm = new FormData();
      retryForm.append('file', file, file.name);
      apiResponse = await fetch(
        `${apiBaseUrl}/v1/listings/${encodeURIComponent(listingId)}/media`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${rotation.credentials.accessToken}`,
            'user-agent': userAgent ?? 'SuqnaaWeb/1.0'
          },
          body: retryForm,
          cache: 'no-store'
        }
      );
    } catch {
      const response = errorResponse('Marketplace service unavailable', 503);
      setWebSessionCookies(response, rotation.credentials);
      return response;
    }
  }

  const responseText = await apiResponse.text();
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
  const retryAfter = apiResponse.headers.get('retry-after');
  if (retryAfter) {
    headers.set('Retry-After', retryAfter);
  }

  const response = new NextResponse(responseText || null, {
    status: apiResponse.status,
    headers
  });

  if (apiResponse.status === 401) {
    clearWebSessionCookies(response);
  } else if (rotatedCredentials) {
    setWebSessionCookies(response, rotatedCredentials);
  }

  return response;
}
