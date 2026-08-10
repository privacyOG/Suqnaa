import { resolveRuntimeSecret } from '../config/runtime-secret.js';
import { resolveWebOrigin } from '../config/web-origin.js';

export const productionChallengeScriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

export interface ProductionSecurityConfigurationInput {
  nodeEnv?: string;
  webOrigin?: string;
  challengeProvider?: string;
  turnstileSiteKey?: string;
  turnstileSecretKey?: string;
  turnstileSecretKeyFile?: string;
  turnstileExpectedHostname?: string;
  challengeScriptUrl?: string;
}

export function validateProductionSecurityConfiguration(
  input: ProductionSecurityConfigurationInput
): void {
  if (input.nodeEnv !== 'production') {
    return;
  }

  const webOrigin = resolveWebOrigin({
    nodeEnv: 'production',
    webOrigin: input.webOrigin
  });
  const webHostname = new URL(webOrigin).hostname;

  if (input.challengeProvider !== 'turnstile') {
    throw new Error('Production human verification must be enabled');
  }

  if ((input.turnstileSiteKey?.trim() ?? '').length < 10) {
    throw new Error('Production human verification site key is missing');
  }

  if (input.turnstileSecretKey?.trim()) {
    throw new Error('Production human verification secret must use a secret file');
  }

  if (!input.turnstileSecretKeyFile?.trim()) {
    throw new Error('Production human verification secret file is missing');
  }

  const secretKey = resolveRuntimeSecret({
    name: 'TURNSTILE_SECRET_KEY',
    file: input.turnstileSecretKeyFile
  });
  if (secretKey.length < 20) {
    throw new Error('Production human verification secret is invalid');
  }

  const expectedHostname = input.turnstileExpectedHostname?.trim() ?? '';
  if (!expectedHostname || expectedHostname !== webHostname) {
    throw new Error('Production human verification hostname must exactly match WEB_ORIGIN');
  }

  if (input.challengeScriptUrl !== productionChallengeScriptUrl) {
    throw new Error('Production human verification script URL is not approved');
  }
}

export function validateEnvironmentProductionSecurityConfiguration(): void {
  validateProductionSecurityConfiguration({
    nodeEnv: process.env.NODE_ENV,
    webOrigin: process.env.WEB_ORIGIN,
    challengeProvider: process.env.CHALLENGE_PROVIDER,
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY,
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY,
    turnstileSecretKeyFile: process.env.TURNSTILE_SECRET_KEY_FILE,
    turnstileExpectedHostname: process.env.TURNSTILE_EXPECTED_HOSTNAME,
    challengeScriptUrl: process.env.NEXT_PUBLIC_CHALLENGE_SCRIPT_URL
  });
}
