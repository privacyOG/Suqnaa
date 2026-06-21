import assert from 'node:assert/strict';
import type {
  ChallengeVerificationInput,
  ChallengeVerificationResult,
  ChallengeVerifier
} from './challenge-verifier.js';
import {
  checkHumanProtection,
  checkHumanProtectionWithChallenge
} from './human-protection.js';

class StubVerifier implements ChallengeVerifier {
  constructor(private readonly result: ChallengeVerificationResult) {}

  async verify(_input: ChallengeVerificationInput): Promise<ChallengeVerificationResult> {
    return this.result;
  }
}

const normalListing = checkHumanProtection({
  action: 'listing.create',
  accountId: 'account_123',
  ip: '127.0.0.1',
  userAgent: 'SuqnaaTest/1.0'
});
assert.equal(normalListing.decision, 'allow');
assert.equal(normalListing.riskScore, 20);

const missingUserAgent = checkHumanProtection({
  action: 'listing.create',
  accountId: 'account_123',
  ip: '127.0.0.1'
});
assert.equal(missingUserAgent.decision, 'challenge');
assert.equal(missingUserAgent.riskScore, 55);
assert.ok(missingUserAgent.reasonCodes.includes('missing_user_agent'));

const missingIp = checkHumanProtection({
  action: 'account.login',
  userAgent: 'SuqnaaTest/1.0'
});
assert.equal(missingIp.decision, 'challenge');
assert.equal(missingIp.riskScore, 50);
assert.ok(missingIp.reasonCodes.includes('missing_ip_context'));

const missingAccount = checkHumanProtection({
  action: 'message.create',
  ip: '127.0.0.1',
  userAgent: 'SuqnaaTest/1.0'
});
assert.equal(missingAccount.decision, 'challenge');
assert.equal(missingAccount.riskScore, 50);
assert.ok(missingAccount.reasonCodes.includes('missing_account_context'));

const failedChallenge = await checkHumanProtectionWithChallenge(
  {
    action: 'listing.create',
    accountId: 'account_123',
    ip: '127.0.0.1'
  },
  new StubVerifier({
    success: false,
    provider: 'test',
    reasonCodes: ['challenge_failed']
  })
);
assert.equal(failedChallenge.decision, 'challenge');
assert.ok(failedChallenge.reasonCodes.includes('challenge_failed'));

const verifiedChallenge = await checkHumanProtectionWithChallenge(
  {
    action: 'listing.create',
    accountId: 'account_123',
    ip: '127.0.0.1',
    challengeResponse: 'valid-test-response'
  },
  new StubVerifier({
    success: true,
    provider: 'test',
    reasonCodes: []
  })
);
assert.equal(verifiedChallenge.decision, 'allow');
assert.equal(verifiedChallenge.riskScore, 55);
assert.ok(verifiedChallenge.reasonCodes.includes('challenge_verified'));
