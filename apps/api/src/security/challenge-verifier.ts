export interface ChallengeVerificationInput {
  response?: string;
  remoteIp?: string;
  action?: string;
}

export interface ChallengeVerificationResult {
  success: boolean;
  provider: string;
  reasonCodes: string[];
}

export interface ChallengeVerifier {
  verify(input: ChallengeVerificationInput): Promise<ChallengeVerificationResult>;
}

export class NoopChallengeVerifier implements ChallengeVerifier {
  async verify(input: ChallengeVerificationInput): Promise<ChallengeVerificationResult> {
    const reasonCodes = input.response
      ? ['challenge_provider_not_configured']
      : ['missing_challenge_response', 'challenge_provider_not_configured'];

    return {
      success: false,
      provider: 'noop',
      reasonCodes
    };
  }
}
