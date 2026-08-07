import { getAuthed, postAuthed } from './authed-api';

export type SellerVerificationLevel = 'seller' | 'business';
export type SellerVerificationStatusValue = 'pending' | 'verified' | 'rejected' | 'expired';
export type SellerVerificationProviderResult = 'pending' | 'passed' | 'failed' | 'review_required' | 'expired';

export interface SellerVerificationCheck {
  id: string;
  level: SellerVerificationLevel;
  status: SellerVerificationStatusValue;
  providerResult: SellerVerificationProviderResult;
  countryCode: string | null;
  reasonCode: string | null;
  submittedAt: string;
  providerCompletedAt: string | null;
  reviewedAt: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  sessionExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SellerVerificationStatusPayload {
  verification: {
    providerEnabled: boolean;
    eligibleLevel: SellerVerificationLevel;
    profile: {
      isBusiness: boolean;
      businessName: string | null;
      countryCode: string | null;
    };
    current: SellerVerificationCheck | null;
    history: Array<SellerVerificationCheck | null>;
  };
}

export interface SellerVerificationSessionPayload {
  session: {
    checkId: string;
    action: 'create' | 'resume';
    hostedUrl: string;
    sessionExpiresAt: string;
  };
}

export function loadSellerVerificationStatus(): Promise<SellerVerificationStatusPayload> {
  return getAuthed<SellerVerificationStatusPayload>('/v1/account/seller-verification');
}

export function beginSellerVerification(
  input: { level: SellerVerificationLevel; countryCode: string },
  challengeResponse?: string
): Promise<SellerVerificationSessionPayload> {
  return postAuthed<SellerVerificationSessionPayload>(
    '/v1/account/seller-verification/start',
    input,
    challengeResponse
  );
}
