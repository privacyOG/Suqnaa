import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('./order-delivery-api.ts', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../components/order-checkout-preparation.tsx', import.meta.url), 'utf8');
const selection = readFileSync(new URL('../components/order-delivery-selection.tsx', import.meta.url), 'utf8');
const delivery = readFileSync(new URL('../components/order-delivery-panel.tsx', import.meta.url), 'utf8');
const shipping = readFileSync(new URL('../components/listing-shipping-options-form.tsx', import.meta.url), 'utf8');
const orderPage = readFileSync(new URL('../app/[locale]/activity/orders/[orderId]/page.tsx', import.meta.url), 'utf8');
const listingPage = readFileSync(new URL('../app/[locale]/sell/manage/[listingId]/edit/page.tsx', import.meta.url), 'utf8');

assert.match(api, /configureOrderDelivery/);
assert.match(api, /issuePickupProof/);
assert.match(api, /verifyPickupProof/);
assert.match(api, /submitDeliveryEvidence/);
assert.match(api, /getOrderTimeline/);
assert.match(api, /getSellerShippingOptions/);

assert.match(checkout, /OrderDeliverySelection/);
assert.match(checkout, /deliveryReady/);
assert.match(selection, /countryCode: 'AU'/);
assert.match(selection, /shippingOptionId/);
assert.match(selection, /full address is stored only inside the protected order/i);

assert.match(delivery, /data-pickup-proof-code/);
assert.match(delivery, /target="_blank" rel="noreferrer noopener"/);
assert.match(delivery, /seller-submitted evidence/i);
assert.match(delivery, /Order timeline/);
assert.match(orderPage, /OrderDeliveryPanel/);

assert.match(shipping, /Fixed shipping methods and rates/);
assert.match(shipping, /options\.length < 8/);
assert.match(listingPage, /ListingShippingOptionsForm/);

console.log('Web delivery and pickup surfaces passed.');
