import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const participant = readFileSync(new URL('./disputes.ts', import.meta.url), 'utf8');
const operations = readFileSync(new URL('./operations-disputes.ts', import.meta.url), 'utf8');
const mapper = readFileSync(new URL('../auth/require-operations-user.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../disputes/dispute-evidence-storage.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../disputes/dispute-service.ts', import.meta.url), 'utf8');

assert.match(participant, /preHandler: requireUser/g);
assert.match(participant, /bodyLimit: maximumDisputeEvidenceBytes/);
assert.match(participant, /detectDisputeEvidenceMime/);
assert.match(participant, /Cache-Control', 'private, no-store'/);
assert.doesNotMatch(participant, /listing-media/);
assert.match(storage, /private, max-age=60/);
assert.doesNotMatch(storage, /MEDIA_PUBLIC_BASE_URL/);

assert.match(operations, /preHandler: requireOperationsUser/g);
assert.match(mapper, /disputes\.read/);
assert.match(mapper, /disputes\.review/);
assert.match(mapper, /disputes\.resolve/);
assert.match(service, /hasPaymentRequestPermission/);
assert.match(service, /requestPaymentOperation/);
assert.doesNotMatch(service, /decidePaymentOperation/);
assert.match(service, /appeal_reviewer_conflict/);

console.log('dispute route authorization and privacy surfaces passed');
