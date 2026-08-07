import { getAuthed, postAuthed } from './authed-api';

export type ContactVerificationChannel = 'email' | 'phone';

export interface ContactVerificationStateChannel {
  channel: ContactVerificationChannel;
  available: boolean;
  destination: string | null;
  verifiedAt: string | null;
}

export interface ContactVerificationState {
  status: string;
  channels: ContactVerificationStateChannel[];
}

export async function getContactVerificationState(): Promise<ContactVerificationState> {
  const payload = await getAuthed<{ verification: ContactVerificationState }>(
    '/v1/account/verification'
  );
  return payload.verification;
}

export async function requestContactVerification(
  channel: ContactVerificationChannel
): Promise<{ expiresAt: string; resendAfterSeconds: number }> {
  return postAuthed('/v1/account/verification/request', { channel });
}

export async function confirmContactVerification(
  channel: ContactVerificationChannel,
  code: string
): Promise<{ verified: boolean; verifiedAt: string; status: string }> {
  return postAuthed('/v1/account/verification/confirm', { channel, code });
}
