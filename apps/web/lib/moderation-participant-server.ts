import { cookies } from 'next/headers';
import { accessCookieName } from './web-session';

export interface ParticipantModerationAction {
  id: string;
  actionType: 'listing_takedown' | 'account_suspend' | 'account_close';
  listingId: string | null;
  listingTitle: string | null;
  accountAction: boolean;
  reasonCode: string;
  reason: string;
  status: 'active' | 'reversed' | 'superseded';
  createdAt: string;
  appealDeadline: string;
  appealable: boolean;
  appeal: { id: string; status: 'open' | 'upheld' | 'overturned' | 'dismissed' } | null;
}

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

export async function loadParticipantModerationActions(): Promise<ParticipantModerationAction[] | null> {
  const access = cookies().get(accessCookieName)?.value;
  if (!access) return null;

  try {
    const response = await fetch(`${apiBaseUrl}/v1/market/moderation/actions`, {
      headers: { authorization: `Bearer ${access}` },
      cache: 'no-store'
    });
    if (!response.ok) return null;
    const payload = await response.json() as { actions?: ParticipantModerationAction[] };
    return Array.isArray(payload.actions) ? payload.actions : [];
  } catch {
    return null;
  }
}
