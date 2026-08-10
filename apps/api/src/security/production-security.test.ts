import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  productionChallengeScriptUrl,
  validateProductionSecurityConfiguration
} from './production-security.js';

const directory = mkdtempSync(join(tmpdir(), 'suqnaa-security-'));
const secretFile = join(directory, 'turnstile_secret_key');
writeFileSync(secretFile, 'production-secret-key-material-1234567890', { mode: 0o600 });

try {
  assert.doesNotThrow(() => validateProductionSecurityConfiguration({
    nodeEnv: 'development'
  }));

  assert.throws(
    () => validateProductionSecurityConfiguration({
      nodeEnv: 'production',
      webOrigin: 'https://suqnaa.example',
      challengeProvider: 'none'
    }),
    /must be enabled/
  );

  assert.throws(
    () => validateProductionSecurityConfiguration({
      nodeEnv: 'production',
      webOrigin: 'https://suqnaa.example',
      challengeProvider: 'turnstile',
      turnstileSiteKey: 'production-site-key',
      turnstileSecretKey: 'inline-secret-key-material-1234567890',
      turnstileExpectedHostname: 'suqnaa.example',
      challengeScriptUrl: productionChallengeScriptUrl
    }),
    /must use a secret file/
  );

  assert.throws(
    () => validateProductionSecurityConfiguration({
      nodeEnv: 'production',
      webOrigin: 'https://suqnaa.example',
      challengeProvider: 'turnstile',
      turnstileSiteKey: 'production-site-key',
      turnstileSecretKeyFile: secretFile,
      turnstileExpectedHostname: 'www.suqnaa.example',
      challengeScriptUrl: productionChallengeScriptUrl
    }),
    /exactly match/
  );

  assert.throws(
    () => validateProductionSecurityConfiguration({
      nodeEnv: 'production',
      webOrigin: 'https://suqnaa.example',
      challengeProvider: 'turnstile',
      turnstileSiteKey: 'production-site-key',
      turnstileSecretKeyFile: secretFile,
      turnstileExpectedHostname: 'suqnaa.example',
      challengeScriptUrl: 'https://example.invalid/challenge.js'
    }),
    /not approved/
  );

  assert.doesNotThrow(() => validateProductionSecurityConfiguration({
    nodeEnv: 'production',
    webOrigin: 'https://suqnaa.example',
    challengeProvider: 'turnstile',
    turnstileSiteKey: 'production-site-key',
    turnstileSecretKeyFile: secretFile,
    turnstileExpectedHostname: 'suqnaa.example',
    challengeScriptUrl: productionChallengeScriptUrl
  }));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
