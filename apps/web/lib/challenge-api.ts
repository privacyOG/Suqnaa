export interface ChallengeActions {
  accountLogin: string;
  accountRegister: string;
  listingCreate: string;
  listingStatusUpdate: string;
  messageCreate: string;
}

export interface ChallengeConfiguration {
  provider: 'none' | 'turnstile';
  enabled: boolean;
  siteKey: string | null;
  actions: ChallengeActions;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export async function getChallengeConfiguration(): Promise<ChallengeConfiguration> {
  const response = await fetch(`${apiBaseUrl}/v1/challenge/config`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error('Unable to load challenge configuration');
  }

  const payload = await response.json() as { challenge: ChallengeConfiguration };
  return payload.challenge;
}
