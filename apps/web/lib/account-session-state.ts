import { cookies } from 'next/headers';
import { accessCookieName, refreshCookieName } from './web-session';

export interface CurrentAccountUser {
  id: string;
  email: string | null;
  phone_e164: string | null;
  display_name: string;
  status: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
}

export interface AccountSessionState {
  user: CurrentAccountUser | null;
  needsRotation: boolean;
}

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

export async function loadAccountSessionState(): Promise<AccountSessionState> {
  const cookieStore = cookies();
  const accessValue = cookieStore.get(accessCookieName)?.value;
  const hasRefreshValue = Boolean(cookieStore.get(refreshCookieName)?.value);

  if (!accessValue) {
    return { user: null, needsRotation: hasRefreshValue };
  }

  try {
    const response = await fetch(`${apiBaseUrl}/v1/account/me`, {
      headers: { authorization: `Bearer ${accessValue}` },
      cache: 'no-store'
    });

    if (response.ok) {
      const payload = await response.json() as { user: CurrentAccountUser };
      return { user: payload.user, needsRotation: false };
    }

    return {
      user: null,
      needsRotation: response.status === 401 && hasRefreshValue
    };
  } catch {
    return { user: null, needsRotation: hasRefreshValue };
  }
}
