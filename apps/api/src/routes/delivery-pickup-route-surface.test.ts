import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const delivery = readFileSync(new URL('./order-delivery.ts', import.meta.url), 'utf8');
const shipping = readFileSync(new URL('./listing-shipping-options.ts', import.meta.url), 'utf8');
const fulfilment = readFileSync(new URL('./order-fulfilment.ts', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('./payments.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../../../infra/db/migrations/030_delivery_pickup.sql', import.meta.url), 'utf8');

assert.match(shipping, /\/listings\/:listingId\/shipping-options/);
assert.match(shipping, /\/market\/listings\/:listingId\/shipping-options/);
assert.match(shipping, /requireUser/);
assert.match(shipping, /\['draft', 'active'\]/);

assert.match(delivery, /\/market\/orders\/:orderId\/delivery/);
assert.match(delivery, /\/market\/orders\/:orderId\/pickup-details/);
assert.match(delivery, /\/market\/orders\/:orderId\/pickup-proof/);
assert.match(delivery, /\/pickup-proof\/verify/);
assert.match(delivery, /\/delivery-evidence/);
assert.match(delivery, /\/timeline/);
assert.match(delivery, /timingSafeEqual/);
assert.match(delivery, /pickupHash/);
assert.doesNotMatch(delivery, /metadata:\s*\{[^}]*address_line1/s);

assert.match(fulfilment, /trackingUrl/);
assert.match(fulfilment, /order_fulfilment_details/);
assert.match(checkout, /Select delivery or pickup before payment/);
assert.match(checkout, /shipping_amount/);
assert.match(server, /register\(orderDeliveryRoutes/);
assert.match(server, /register\(listingShippingOptionRoutes/);

assert.match(migration, /CREATE TABLE listing_shipping_options/);
assert.match(migration, /CREATE TABLE order_fulfilment_details/);
assert.match(migration, /CREATE TABLE pickup_proofs/);
assert.match(migration, /CREATE TABLE order_fulfilment_evidence/);
assert.match(migration, /CREATE TABLE order_timeline_events/);
assert.match(migration, /Order price cannot change after payment collection begins/);
assert.match(migration, /code_hash char\(64\)/);

console.log('Delivery and pickup route surface tests passed.');
