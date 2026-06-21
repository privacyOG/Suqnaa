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

const publicAccountActions = new Set([
  'account.register',
  'account.login',
]);

const highImpactActions = new Set([
  'account.register',
  'account.login',
  'listing.create',
  'listing.status_update',
  'message.create',
  'offer.create',
  'order.create',
  'profile.check',
  'review.create',
  'timed_sale.create',
]);

const challengeThreshold = 50;

export function checkHumanProtection(input: ProtectionInput): ProtectionResult {
  const reasonCodes: string[] = [];
  let riskScore = 0;

  if (highImpactActions.has(input.action)) {
    riskScore += 20;
    reasonCodes.push('high_impact_action');
  }

  if (!input.ip) {
    riskScore += 30;
    reasonCodes.push('missing_ip_context');
  }

  if (!input.userAgent) {
    riskScore += 35;
    reasonCodes.push('missing_user_agent');
  }

  if (!input.accountId && !publicAccountActions.has(input.action)) {
    riskScore += 30;
    reasonCodes.push('missing_account_context');
  }

  if (riskScore >= challengeThreshold) {
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
