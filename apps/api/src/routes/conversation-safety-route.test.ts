import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const safetyRoute = readFileSync(new URL('./conversation-safety.ts', import.meta.url), 'utf8');
const messageRoute = readFileSync(new URL('./messages.ts', import.meta.url), 'utf8');
const conversationRoute = readFileSync(new URL('./conversations.ts', import.meta.url), 'utf8');
const reportRoute = readFileSync(new URL('./reports.ts', import.meta.url), 'utf8');
const operationsRoute = readFileSync(new URL('./operations.ts', import.meta.url), 'utf8');
const operationsGuard = readFileSync(new URL('../auth/require-operations-user.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

for (const path of [
  '/conversations/:conversationId/safety',
  '/conversations/:conversationId/mute',
  '/conversations/:conversationId/block'
]) {
  assert.ok(safetyRoute.includes(path), `Missing safety route ${path}`);
}

assert.match(safetyRoute, /preHandler: requireUser/g);
assert.match(safetyRoute, /setConversationMuted/);
assert.match(safetyRoute, /setConversationBlocked/);
assert.match(safetyRoute, /conversation\.mute/);
assert.match(safetyRoute, /conversation\.block/);
assert.match(messageRoute, /assertMessageAttachmentsDisabled/);
assert.match(messageRoute, /enforceDurableMessageSpamPolicy/);
assert.match(messageRoute, /lockMessagingPair/);
assert.match(messageRoute, /content_fingerprint/);
assert.match(messageRoute, /attachments:\s*\[\]/);
assert.match(conversationRoute, /blockedByMe/);
assert.match(conversationRoute, /messagingAvailable/);
assert.match(conversationRoute, /publicMessagePolicy/);
assert.match(reportRoute, /messageId:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/);
assert.match(reportRoute, /messages\.conversation_id/);
assert.match(reportRoute, /You cannot report your own message/);
assert.ok(operationsRoute.includes('/operations/queue/:id/conversation-context'));
assert.match(operationsRoute, /reported_message\.body/);
assert.match(operationsRoute, /buyerBlockedSeller/);
assert.match(operationsRoute, /sellerBlockedBuyer/);
assert.match(operationsGuard, /conversation-context/);
assert.match(operationsGuard, /moderation\.queue\.read/);
assert.match(server, /import \{ conversationSafetyRoutes \} from '\.\/routes\/conversation-safety\.js'/);
assert.match(server, /app\.register\(conversationSafetyRoutes, \{ prefix: '\/v1' \}\)/);

console.log('Conversation safety route surface tests passed.');
