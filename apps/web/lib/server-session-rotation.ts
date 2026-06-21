import {
  maximumRefreshTokenLength,
  parseWebSessionCredentials,
  validToken,
  type WebSessionCredentials
} from './web-session';

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

export type SessionRotationResult =
  | {
      ok: true;
      credentials: WebSessionCredentials;
    }
  | {
      ok: false;
      status: 401 | 429 | 502 | 503;
      error: string;
      retryAfter?: string;
    };

export async function rotateServerSession(
  refreshToken: unknown,
  userAgent?: string | null
): Promise<SessionRotationResult> {
  if (!validToken(refreshToken, maximumRefreshTokenLength)) {
    return {
      ok: false,
      status: 401,
      error: 'Refresh session unavailable'
    };
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': userAgent ?? 'SuqnaaWeb/1.0'
      },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store'
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Session service unavailable'
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 429
        ? 429
        : response.status === 401
          ? 401
          : 502,
      error: response.status === 429
        ? 'Too many refresh attempts'
        : 'Refresh session rejected',
      retryAfter: response.headers.get('retry-after') ?? undefined
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      status: 502,
      error: 'Invalid refresh response'
    };
  }

  const credentials = parseWebSessionCredentials(payload);
  if (!credentials) {
    return {
      ok: false,
      status: 502,
      error: 'Invalid refresh response'
    };
  }

  return {
    ok: true,
    credentials
  };
}
