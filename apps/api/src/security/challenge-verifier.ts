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
    if (!input.response) {
      return {
        success: false,
        provider: 'noop',
        reasonCodes: ['missing_challenge_response']
      };
    }

    return {
      success: true,
      provider: 'noop',
      reasonCodes: []
    };
  }
}
