import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safetyDecisionPoints } from '../components/contextual-safety-guidance';

const component = readFileSync(new URL('../components/contextual-safety-guidance.tsx', import.meta.url), 'utf8');
const listingPage = readFileSync(new URL('../app/[locale]/sell/manage/[listingId]/edit/page.tsx', import.meta.url), 'utf8');
const messagesPage = readFileSync(new URL('../app/[locale]/messages/page.tsx', import.meta.url), 'utf8');
const orderPage = readFileSync(new URL('../app/[locale]/activity/orders/[orderId]/page.tsx', import.meta.url), 'utf8');

assert.deepEqual(safetyDecisionPoints, [
  'listing', 'messaging', 'checkout', 'pickup', 'shipping', 'payment', 'dispute'
]);

for (const point of safetyDecisionPoints) {
  assert.match(component, new RegExp(`${point}: \\{`));
}

assert.match(component, /\/policy\/safety/);
assert.match(component, /Read safety guidance/);
assert.match(component, /اقرأ إرشادات السلامة/);
assert.match(component, /verification codes/);
assert.match(component, /protected checkout/);
assert.match(component, /public or otherwise safe meeting place/);
assert.match(component, /tracking and dispatch evidence/);
assert.match(component, /do not edit or fabricate evidence/);

assert.match(listingPage, /point="listing"/);
assert.match(messagesPage, /point="messaging"/);
for (const point of ['shipping', 'pickup', 'checkout', 'payment', 'dispute']) {
  assert.match(orderPage, new RegExp(`point="${point}"`));
}

console.log('Contextual safety guidance surface passed.');
