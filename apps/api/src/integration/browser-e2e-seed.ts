import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { bootstrapPlatformAdministrator } from '../admin/role-service.js';
import { closeDb, db } from '../db/index.js';
import { authRoutes } from '../routes/auth.js';

const app = Fastify();
await app.register(authRoutes, { prefix: '/v1' });

const password = 'Browser-E2E-password-123!';
const runId = randomUUID();
const listingId = randomUUID();
const outputPath = resolve(process.cwd(), process.argv[2] ?? '../../web/e2e/.seed.json');

async function register(email: string, displayName: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { 'user-agent': 'Suqnaa-Browser-E2E-Seed/1.0' },
    payload: { email, displayName, password }
  });
  if (response.statusCode !== 201) {
    throw new Error(`Unable to seed ${email}: ${response.statusCode} ${response.body}`);
  }
  return response.json() as { user: { id: string } };
}

try {
  const sellerEmail = `browser-seller-${runId}@example.test`;
  const buyerEmail = `browser-buyer-${runId}@example.test`;
  const operationsEmail = `browser-operations-${runId}@example.test`;

  const seller = await register(sellerEmail, 'Browser Seller');
  const buyer = await register(buyerEmail, 'Browser Buyer');
  const operations = await register(operationsEmail, 'Browser Operations');
  const now = new Date();
  const ids = [seller.user.id, buyer.user.id, operations.user.id];

  await db.updateTable('users').set({
    status: 'active',
    email_verified_at: now,
    updated_at: now
  }).where('id', 'in', ids).execute();

  await bootstrapPlatformAdministrator(operations.user.id);

  await db.insertInto('listings').values({
    id: listingId,
    seller_id: seller.user.id,
    title: 'Browser E2E marketplace listing',
    description: 'A deterministic public listing used only by the P1-16 browser end-to-end suite.',
    price_amount: '125.00',
    currency_code: 'AUD',
    condition: 'good',
    availability_status: 'in_stock',
    available_quantity: 1,
    status: 'active',
    country_code: 'AU',
    region: 'NSW',
    city: 'Sydney',
    suburb: 'Test suburb',
    allow_pickup: true,
    allow_delivery: true,
    published_at: now,
    created_at: now,
    updated_at: now
  }).execute();

  const seed = {
    password,
    listingId,
    buyer: { id: buyer.user.id, email: buyerEmail },
    seller: { id: seller.user.id, email: sellerEmail },
    operations: { id: operations.user.id, email: operationsEmail }
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');
  console.log(`Browser E2E seed written to ${outputPath}`);
} finally {
  await app.close();
  await closeDb();
}
