import { NextRequest, NextResponse } from 'next/server';
import { resolveProtectedRoute } from '../../../../lib/protected-route-policy';
import { rotateServerSession, type SessionRotationResult } from '../../../../lib/server-session-rotation';
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
const defaultMaximumRequestBodyBytes = 64 * 1024;
const legacyMediaMaximumRequestBodyBytes = 6 * 1024 * 1024;
const binaryMediaMaximumRequestBodyBytes = 4 * 1024 * 1024;
const maximumChallengeLength = 2048;
const supportedBinaryMediaTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

interface RouteContext {
  params: {
    segments: string[];
  };
}

interface PreparedRequest {
  route: NonNullable<ReturnType<typeof resolveProtectedRoute>>;
  body?: string | ArrayBuffer;
  contentType?: string;
  challenge?: string;
}

function errorResponse(message: string, status: number, retryAfter?: string): NextResponse {
  const response = NextResponse.json({ error: message }, { status });
  response.headers.set('Cache-Control', 'no-store');
  if (retryAfter) {
    response.headers.set('Retry-After', retryAfter);
  }
  return response;
}

function isBinaryMediaUploadRoute(
  route: NonNullable<ReturnType<typeof resolveProtectedRoute>>
): boolean {
  return /^\/v1\/listings\/[0-9a-fA-F-]+\/media\/upload$/.test(route.path);
}

function isOwnerMediaDeliveryRoute(
  route: NonNullable<ReturnType<typeof resolveProtectedRoute>>
): boolean {
  return /^\/v1\/listings\/[0-9a-fA-F-]+\/media\/[0-9a-fA-F-]+\/mine$/.test(
    route.path
  );
}

function maximumJsonBodyBytesForRoute(
  route: NonNullable<ReturnType<typeof resolveProtectedRoute>>
): number {
  return /^\/v1\/listings\/[0-9a-fA-F-]+\/media$/.test(route.path)
    ? legacyMediaMaximumRequestBodyBytes
    : defaultMaximumRequestBodyBytes;
}

function normalizedContentType(value: string | null): string | null {
  return value?.split(';', 1)[0].trim().toLowerCase() || null;
}

async function prepareRequest(
  request: NextRequest,
  context: RouteContext
): Promise<PreparedRequest | NextResponse> {
  const route = resolveProtectedRoute(
    request.method,
    context.params.segments,
    request.nextUrl.searchParams
  );
  if (!route) {
    return errorResponse('Protected route not allowed', 404);
  }

  if (!isSameOriginMutation(request)) {
    return errorResponse('Origin not allowed', 403);
  }

  const challenge = request.headers.get('x-suqnaa-human-check')?.trim();
  if (challenge && challenge.length > maximumChallengeLength) {
    return errorResponse('Human-check response is too long', 400);
  }

  if (route.method === 'GET') {
    return { route, challenge };
  }

  if (isBinaryMediaUploadRoute(route)) {
    const contentType = normalizedContentType(request.headers.get('content-type'));
    if (!contentType || !supportedBinaryMediaTypes.has(contentType)) {
      return errorResponse('Unsupported image content type', 415);
    }

    const body = await request.arrayBuffer();
    if (body.byteLength === 0) {
      return errorResponse('Image body is required', 400);
    }
    if (body.byteLength > binaryMediaMaximumRequestBodyBytes) {
      return errorResponse('Request body is too large', 413);
    }

    return {
      route,
      challenge,
      body,
      contentType
    };
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > maximumJsonBodyBytesForRoute(route)) {
    return errorResponse('Request body is too large', 413);
  }

  let parsed: unknown;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return errorResponse('JSON body must be an object', 400);
  }

  return {
    route,
    challenge,
    body: JSON.stringify(parsed),
    contentType: 'application/json'
  };
}

async function callApi(
  prepared: PreparedRequest,
  accessToken: string,
  userAgent: string | null
): Promise<Response> {
  const suffix = prepared.route.query ? `?${prepared.route.query}` : '';
  return fetch(`${apiBaseUrl}${prepared.route.path}${suffix}`, {
    method: prepared.route.method,
    headers: {
      accept: isOwnerMediaDeliveryRoute(prepared.route)
        ? 'image/jpeg,image/png,image/webp'
        : 'application/json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': userAgent ?? 'SuqnaaWeb/1.0',
      ...(prepared.route.method === 'POST' && prepared.contentType
        ? { 'content-type': prepared.contentType }
        : {}),
      ...(prepared.challenge
        ? { 'x-suqnaa-human-check': prepared.challenge }
        : {})
    },
    body: prepared.route.method === 'POST' ? prepared.body : undefined,
    cache: 'no-store',
    redirect: 'follow'
  });
}

function rotationFailureResponse(rotation: Exclude<SessionRotationResult, { ok: true }>): NextResponse {
  return errorResponse(rotation.error, rotation.status, rotation.retryAfter);
}

async function upstreamResponse(
  apiResponse: Response,
  credentials?: WebSessionCredentials
): Promise<NextResponse> {
  const contentType = apiResponse.headers.get('content-type');
  const normalizedType = normalizedContentType(contentType);
  const isJson = normalizedType === 'application/json';
  const retryAfter = apiResponse.headers.get('retry-after');
  const upstreamCacheControl = apiResponse.headers.get('cache-control');
  const headers = new Headers({
    'Cache-Control': isJson
      ? 'no-store'
      : upstreamCacheControl ?? 'private, max-age=60',
    'X-Content-Type-Options': 'nosniff'
  });

  if (contentType) {
    headers.set('Content-Type', contentType);
  }
  if (retryAfter) {
    headers.set('Retry-After', retryAfter);
  }

  const body = isJson
    ? await apiResponse.text()
    : await apiResponse.arrayBuffer();
  if (!isJson && body instanceof ArrayBuffer) {
    headers.set('Content-Length', String(body.byteLength));
  }

  const response = new NextResponse(
    isJson ? (body as string || null) : body as ArrayBuffer,
    {
      status: apiResponse.status,
      headers
    }
  );
  if (apiResponse.status === 401) {
    clearWebSessionCookies(response);
  } else if (credentials) {
    setWebSessionCookies(response, credentials);
  }
  return response;
}

async function handleProtectedRequest(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const prepared = await prepareRequest(request, context);
  if (prepared instanceof NextResponse) {
    return prepared;
  }

  const userAgent = request.headers.get('user-agent');
  const refreshToken = request.cookies.get(refreshCookieName)?.value;
  let accessToken = request.cookies.get(accessCookieName)?.value;
  let rotatedCredentials: WebSessionCredentials | undefined;

  if (!accessToken) {
    const rotation = await rotateServerSession(refreshToken, userAgent);
    if (!rotation.ok) {
      const response = rotationFailureResponse(rotation);
      if (rotation.status === 401) {
        clearWebSessionCookies(response);
      }
      return response;
    }
    rotatedCredentials = rotation.credentials;
    accessToken = rotation.credentials.accessToken;
  }

  let apiResponse: Response;
  try {
    apiResponse = await callApi(prepared, accessToken, userAgent);
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
      const response = rotationFailureResponse(rotation);
      if (rotation.status === 401) {
        clearWebSessionCookies(response);
      }
      return response;
    }

    rotatedCredentials = rotation.credentials;
    try {
      apiResponse = await callApi(prepared, rotation.credentials.accessToken, userAgent);
    } catch {
      const response = errorResponse('Marketplace service unavailable', 503);
      setWebSessionCookies(response, rotation.credentials);
      return response;
    }
  }

  return upstreamResponse(apiResponse, rotatedCredentials);
}

export function GET(request: NextRequest, context: RouteContext) {
  return handleProtectedRequest(request, context);
}

export function POST(request: NextRequest, context: RouteContext) {
  return handleProtectedRequest(request, context);
}
