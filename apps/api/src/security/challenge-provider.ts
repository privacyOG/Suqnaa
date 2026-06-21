import { env } from '../config/env.js';
import { createChallengeVerifier } from './challenge-verifier.js';

export const challengeVerifier = createChallengeVerifier({
  provider: env.CHALLENGE_PROVIDER,
  secretKey: env.TURNSTILE_SECRET_KEY,
  expectedHostname: env.TURNSTILE_EXPECTED_HOSTNAME,
  timeoutMs: env.TURNSTILE_TIMEOUT_MS
});
