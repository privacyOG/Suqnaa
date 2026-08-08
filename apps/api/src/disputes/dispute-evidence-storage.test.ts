import assert from 'node:assert/strict';
import {
  detectDisputeEvidenceMime,
  extensionForDisputeEvidence,
  normalizeDisputeEvidenceMime,
  resolveDisputeEvidenceStorageDriver
} from './dispute-evidence-storage.js';

assert.equal(detectDisputeEvidenceMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
assert.equal(detectDisputeEvidenceMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
assert.equal(detectDisputeEvidenceMime(Buffer.from('RIFF1234WEBP')), 'image/webp');
assert.equal(detectDisputeEvidenceMime(Buffer.from('%PDF-1.7')), 'application/pdf');
assert.equal(detectDisputeEvidenceMime(Buffer.from('<html>')), null);
assert.equal(normalizeDisputeEvidenceMime('APPLICATION/PDF; charset=binary'), 'application/pdf');
assert.equal(normalizeDisputeEvidenceMime('text/html'), null);
assert.equal(extensionForDisputeEvidence('application/pdf'), 'pdf');
assert.equal(resolveDisputeEvidenceStorageDriver({ nodeEnv: 'test', driver: 'local' }), 'local');
assert.throws(() => resolveDisputeEvidenceStorageDriver({ nodeEnv: 'production', driver: 'local' }), /S3 dispute evidence storage is required/);

console.log('private dispute evidence validation tests passed');
