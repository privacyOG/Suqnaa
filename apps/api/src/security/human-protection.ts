import type { ChallengeVerifier } from './challenge-verifier.js';

export type ProtectionDecision = 'allow' | 'challenge' | 'slow_down' | 'reject';

export interface ProtectionInput {
  action: string;
  accountId?: string;
  ip?: string;
  sessionId?: string;
  userAgent?: string;
  challengeResponse?: string;
}

export interface ProtectionResult {
  decision: ProtectionDecision;
  reasonCodes: string[];
  riskScore: number;
}

const highImpactActions = new Set([
  'account.register',
  'account.login',
  'listing.create',
  'message.create',
  'offer.create',
  'profile.check',
]);

export function checkHumanProtection(input: ProtectionInput): ProtectionResult {
  const reasonCodes: string[] = [];
  let riskScore = 0;

  if (highImpactActions.has(input.action)) {
    riskScore += 10;
    reasonCodes.push('high_impact_action');
  }

  if (!input.userAgent) {
    riskScore += 15;
    reasonCodes.push('missing_user_agent');
  }

  if (!input.accountId && input.action !== 'account.register' && input.action !== 'account.login') {
    riskScore += 10;
    reasonCodes.push('missing_account_context');
  }

  if (riskScore >= 50) {
    return { decision: 'challenge', reasonCodes, riskScore };
  }

  return { decision: 'allow', reasonCodes, riskScore };
}

export async function checkHumanProtectionWithChallenge(
  input: ProtectionInput,
  verifier: ChallengeVerifier
): Promise<ProtectionResult> {
  const result = checkHumanProtection(input);

  if (result.decision !== 'challenge') {
    return result;
  }

  const verification = await verifier.verify({
    response: input.challengeResponse,
    remoteIp: input.ip,
    action: input.action
  });

  if (!verification.success) {
    return {
      ...result,
      reasonCodes: [...result.reasonCodes, ...verification.reasonCodes]
    };
  }

  return {
    decision: 'allow',
    reasonCodes: [...result.reasonCodes, 'challenge_verified'],
    riskScore: result.riskScore
  };
}

export function humanProtectionResponse(result: ProtectionResult) {
  return {
    requiresHumanCheck: result.decision === 'challenge',
    decision: result.decision,
    reasonCodes: result.reasonCodes,
  };
}
