import { getAuthed, postAuthed } from './authed-api';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export interface SecuritySessionRecord {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
}

export class PasswordRecoveryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: Record<string, unknown>,
    readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'PasswordRecoveryError';
  }
}

async function publicPost(
  path: string,
  body: Record<string, unknown>,
  challengeResponse?: string
): Promise<Record<string, unknown>> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(challengeResponse ? { 'x-suqnaa-human-check': challengeResponse } : {})
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const parsedRetry = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
    throw new PasswordRecoveryError(
      typeof payload.error === 'string' ? payload.error : 'Password recovery request failed',
      response.status,
      payload,
      Number.isFinite(parsedRetry) && parsedRetry > 0 ? parsedRetry : undefined
    );
  }
  return payload;
}

export async function requestPasswordReset(email: string, challengeResponse?: string): Promise<void> {
  await publicPost('/v1/auth/password/forgot', { email }, challengeResponse);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await publicPost('/v1/auth/password/reset', { token, newPassword });
}

export async function listSecuritySessions(): Promise<SecuritySessionRecord[]> {
  const response = await getAuthed<{ sessions: SecuritySessionRecord[] }>('/v1/account/security/sessions');
  return response.sessions;
}

export async function changeAccountPassword(currentPassword: string, newPassword: string): Promise<number> {
  const response = await postAuthed<{ changed: true; revokedSessions: number }>(
    '/v1/account/security/password',
    { currentPassword, newPassword }
  );
  return response.revokedSessions;
}

export async function revokeSecuritySession(sessionId: string): Promise<void> {
  await postAuthed(`/v1/account/security/sessions/${sessionId}/revoke`, {});
}

export async function revokeAllSecuritySessions(): Promise<number> {
  const response = await postAuthed<{ revokedSessions: number }>(
    '/v1/account/security/sessions/revoke-all',
    {}
  );
  return response.revokedSessions;
}
