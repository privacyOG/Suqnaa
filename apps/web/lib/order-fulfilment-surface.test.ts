import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync(
  new URL('../components/order-fulfilment-action.tsx', import.meta.url),
  'utf8'
);
const page = readFileSync(
  new URL('../app/[locale]/activity/orders/[orderId]/page.tsx', import.meta.url),
  'utf8'
);
const api = readFileSync(
  new URL('./order-fulfilment-api.ts', import.meta.url),
  'utf8'
);
const policy = readFileSync(
  new URL('./protected-route-policy.ts', import.meta.url),
  'utf8'
);

assert.match(page, /import \{ OrderFulfilmentAction \}/);
assert.match(page, /<OrderFulfilmentAction locale=\{params\.locale\} orderId=\{params\.orderId\} \/>/);
assert.match(component, /getOrderActivityDetail\(orderId\)/);
assert.match(component, /getOrderPaymentContext\(orderId\)/);
assert.match(component, /availableFulfilmentActions\(order, context\)/);
assert.match(component, /configuration\?\.actions\.fulfilmentManage/);
assert.match(component, /configuration\?\.actions\.fulfilmentConfirm/);
assert.match(component, /updateOrderFulfilment\(/);
assert.match(component, /response\.payment\.releaseEnabled !== false/);
assert.match(component, /minLength=\{2\}/);
assert.match(component, /maxLength=\{80\}/);
assert.match(component, /minLength=\{3\}/);
assert.match(component, /maxLength=\{160\}/);
assert.match(component, /Confirming receipt never releases funds automatically/);
assert.match(component, /لا يؤدي تأكيد الاستلام إلى تحرير الأموال تلقائياً/);
assert.doesNotMatch(component, /releasePayment|releaseFunds|payment\.release\(/);

assert.match(api, /\/payment-context`/);
assert.match(api, /\/fulfilment`/);
assert.match(api, /action: 'ready_for_pickup'/);
assert.match(api, /action: 'shipped'/);
assert.match(api, /action: 'confirm_received'/);
assert.doesNotMatch(api, /providerReference/);

assert.match(
  policy,
  /method: 'GET', pattern: new RegExp\(`\^\/v1\/market\/orders\/\$\{uuid\}\/payment-context\$`\)/
);
assert.match(
  policy,
  /method: 'POST', pattern: new RegExp\(`\^\/v1\/market\/orders\/\$\{uuid\}\/fulfilment\$`\)/
);
