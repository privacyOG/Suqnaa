export type JsonBody = Record<string, unknown>;

export interface AuthedErrorPayload {
  error?: string;
  requiresHumanCheck?: boolean;
  decision?: string;
  reasonCodes?: string[];
}

export class AuthedRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: AuthedErrorPayload,
    readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'AuthedRequestError';
  }
}

function proxyPath(path: string): string {
  if (!path.startsWith('/v1/')) {
    throw new Error('Protected API paths must begin with /v1/');
  }
  return `/api/authed${path}`;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: 'Invalid marketplace response' };
  }
}

async function requestAuthed<T>(
  method: 'GET' | 'POST',
  path: string,
  input?: JsonBody,
  challengeResponse?: string
): Promise<T> {
  const response = await fetch(proxyPath(path), {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...(challengeResponse
        ? { 'x-suqnaa-human-check': challengeResponse }
        : {})
    },
    body: method === 'POST' ? JSON.stringify(input ?? {}) : undefined
  });

  const payload = await readPayload(response);
  if (!response.ok) {
    const errorPayload = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? payload as AuthedErrorPayload
      : {};
    const parsedRetryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
    throw new AuthedRequestError(
      errorPayload.error ?? 'Protected marketplace request failed',
      response.status,
      errorPayload,
      Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0
        ? parsedRetryAfter
        : undefined
    );
  }

  return payload as T;
}

export function getAuthed<T = Record<string, unknown>>(path: string): Promise<T> {
  return requestAuthed<T>('GET', path);
}

export function postAuthed<T = Record<string, unknown>>(
  path: string,
  input: JsonBody,
  challengeResponse?: string
): Promise<T> {
  return requestAuthed<T>('POST', path, input, challengeResponse);
}
