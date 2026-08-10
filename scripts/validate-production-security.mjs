import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../apps/api/src/server.ts', import.meta.url), 'utf8');
const webOrigin = readFileSync(new URL('../apps/api/src/config/web-origin.ts', import.meta.url), 'utf8');
const productionSecurity = readFileSync(
  new URL('../apps/api/src/security/production-security.ts', import.meta.url),
  'utf8'
);
const challengeVerifier = readFileSync(
  new URL('../apps/api/src/security/challenge-verifier.ts', import.meta.url),
  'utf8'
);
const compose = readFileSync(new URL('../deploy/compose.production.yml', import.meta.url), 'utf8');
const caddy = readFileSync(new URL('../deploy/Caddyfile', import.meta.url), 'utf8');
const secretContract = readFileSync(new URL('../deploy/secrets/README.md', import.meta.url), 'utf8');
const rotateScript = readFileSync(new URL('../deploy/rotate-file-secret.sh', import.meta.url), 'utf8');
const securityWorkflow = readFileSync(
  new URL('../.github/workflows/security-review.yml', import.meta.url),
  'utf8'
);
const dependabot = readFileSync(new URL('../.github/dependabot.yml', import.meta.url), 'utf8');
const securityRunbook = readFileSync(new URL('../docs/SECURITY_OPERATIONS.md', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

assert.match(server, /validateEnvironmentProductionSecurityConfiguration\(\)/);
assert.match(server, /if \(origin === webOrigin\)/);
assert.match(server, /if \(origin !== webOrigin\)[\s\S]*?reply\.code\(403\)/);
assert.doesNotMatch(server, /Access-Control-Allow-Origin['"],\s*['"]\*/);

assert.match(webOrigin, /url\.protocol !== 'https:'/);
assert.match(webOrigin, /url\.username \|\| url\.password/);
assert.match(webOrigin, /origin !== url\.origin/);
assert.match(webOrigin, /exact origin/);

assert.match(productionSecurity, /challengeProvider !== 'turnstile'/);
assert.match(productionSecurity, /Production human verification must be enabled/);
assert.match(productionSecurity, /turnstileSecretKeyFile/);
assert.match(productionSecurity, /secret must use a secret file/);
assert.match(productionSecurity, /expectedHostname !== webHostname/);
assert.match(productionSecurity, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
assert.match(challengeVerifier, /TURNSTILE_SECRET_KEY_FILE/);
assert.match(challengeVerifier, /resolveRuntimeSecret/);

const apiBlock = compose.match(/^  api:[\s\S]*?(?=^  web:)/m)?.[0] ?? '';
assert.ok(apiBlock, 'unable to inspect production API service block');
assert.match(apiBlock, /TURNSTILE_SECRET_KEY_FILE:\s*\/run\/secrets\/turnstile_secret_key/);
assert.match(apiBlock, /- turnstile_secret_key/);
assert.match(compose, /^  turnstile_secret_key:\n\s+file: .*turnstile_secret_key/m);
assert.match(envExample, /^TURNSTILE_SECRET_KEY_FILE=$/m);

for (const header of [
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'X-Frame-Options',
  'Permissions-Policy',
  'Content-Security-Policy'
]) {
  assert.ok(caddy.includes(header), `missing production edge header: ${header}`);
}
assert.match(caddy, /max-age=63072000; includeSubDomains; preload/);
assert.match(caddy, /default-src 'none'; frame-ancestors 'none'; base-uri 'none'/);
assert.match(caddy, /frame-ancestors 'none'; object-src 'none'; base-uri 'self'/);
assert.match(caddy, /-Server/);

assert.match(secretContract, /`turnstile_secret_key`/);
assert.match(secretContract, /atomically renaming it to `turnstile_secret_key`/);
assert.match(secretContract, /do not rotate a password pepper or signing key blindly/i);
assert.match(rotateScript, /install -m 0600/);
assert.match(rotateScript, /mv -f "\$temporary" "\$target"/);
assert.match(rotateScript, /secret_file_rotated/);
assert.doesNotMatch(rotateScript, /cat\s+"?\$replacement_file/);

assert.match(securityWorkflow, /^  schedule:/m);
assert.match(securityWorkflow, /pnpm audit --audit-level=high/);
assert.match(securityWorkflow, /node scripts\/validate-production-security\.mjs/);

for (const ecosystem of ['npm', 'github-actions', 'docker', 'pub']) {
  assert.ok(
    dependabot.includes(`package-ecosystem: ${ecosystem}`),
    `Dependabot missing ecosystem: ${ecosystem}`
  );
}

assert.match(securityRunbook, /perform a documented manual review at least monthly/i);
assert.match(securityRunbook, /high\/critical dependency advisory/i);
assert.match(securityRunbook, /exact HTTPS origin/i);

console.log('Production security surface passed.');
