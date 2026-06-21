const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export interface RegisterInput {
  email?: string;
  phone?: string;
  displayName: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
  displayName?: string;
  status?: string;
}

export interface AuthSession {
  refreshToken: string;
  sessionId: string;
  expiresAt: string;
}

export interface AuthPayload {
  user: AuthUser;
  accessToken: string;
  session: AuthSession;
}

export interface ApiErrorPayload {
  error?: string;
  requiresHumanCheck?: boolean;
  decision?: string;
  reasonCodes?: string[];
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: ApiErrorPayload
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function challengeHeaders(challengeResponse?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(challengeResponse
      ? { 'x-suqnaa-human-check': challengeResponse }
      : {})
  };
}

async function readAuthResponse(response: Response, fallbackMessage: string): Promise<AuthPayload> {
  const payload = await response.json() as AuthPayload | ApiErrorPayload;

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload;
    throw new ApiRequestError(
      errorPayload.error ?? fallbackMessage,
      response.status,
      errorPayload
    );
  }

  return payload as AuthPayload;
}

export async function register(
  input: RegisterInput,
  challengeResponse?: string
): Promise<AuthPayload> {
  const response = await fetch(`${apiBaseUrl}/v1/auth/register`, {
    method: 'POST',
    headers: challengeHeaders(challengeResponse),
    body: JSON.stringify(input)
  });

  return readAuthResponse(response, 'Unable to register');
}

export async function login(
  input: LoginInput,
  challengeResponse?: string
): Promise<AuthPayload> {
  const response = await fetch(`${apiBaseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: challengeHeaders(challengeResponse),
    body: JSON.stringify(input)
  });

  return readAuthResponse(response, 'Unable to login');
}

export async function currentAccount(accessToken: string) {
  const response = await fetch(`${apiBaseUrl}/v1/account/me`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Unable to load current account');
  }

  return response.json();
}
