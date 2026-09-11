import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { closeDb } from '../db/index.js';
import { transformListingImage } from '../media/listing-image-transform.js';
import { claimEnabledNotificationDeliveries } from '../notifications/outbox-claim.js';
import { verifyAndParseStripeWebhook } from '../payments/stripe-webhook.js';

type ScenarioResult = {
  name: string;
  operations: number;
  concurrency: number;
  elapsedMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  throughputPerSecond: number;
  threshold: Record<string, number>;
  passed: boolean;
  notes?: Record<string, number | string | boolean>;
};

const thresholds = {
  load: { p95Ms: 1200, minThroughputPerSecond: 8 },
  concurrency: { p95Ms: 300 },
  pagination: { p95Ms: 1400 },
  media: { p95Ms: 3000 },
  queue: { p95Ms: 1800, minClaimed: 200 },
  paymentEvent: { p95Ms: 25, minThroughputPerSecond: 100 },
  database: { p95Ms: 150 }
} as const;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const apiBaseUrl = process.env.PERFORMANCE_API_BASE_URL ?? 'http://127.0.0.1:4000';
const reportPath = process.env.PERFORMANCE_REPORT_PATH ?? 'performance-report.json';
const pool = new pg.Pool({ connectionString: databaseUrl, max: 20 });
const fixtureEmail = 'p1-18-performance@example.test';
let sellerId = '';
let listingIds: string[] = [];

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function rounded(value: number): number {
  return Number(value.toFixed(2));
}

function buildResult(input: {
  name: string;
  durations: number[];
  concurrency: number;
  elapsedMs: number;
  threshold: Record<string, number>;
  passed: boolean;
  notes?: Record<string, number | string | boolean>;
}): ScenarioResult {
  return {
    name: input.name,
    operations: input.durations.length,
    concurrency: input.concurrency,
    elapsedMs: rounded(input.elapsedMs),
    p50Ms: rounded(percentile(input.durations, 50)),
    p95Ms: rounded(percentile(input.durations, 95)),
    p99Ms: rounded(percentile(input.durations, 99)),
    throughputPerSecond: rounded(input.durations.length / Math.max(input.elapsedMs / 1000, 0.001)),
    threshold: input.threshold,
    passed: input.passed,
    notes: input.notes
  };
}

async function runConcurrent(total: number, concurrency: number, operation: (index: number) => Promise<void>): Promise<{ durations: number[]; elapsedMs: number }> {
  const durations: number[] = [];
  let cursor = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= total) return;
      const operationStarted = performance.now();
      await operation(index);
      durations.push(performance.now() - operationStarted);
    }
  }));
  return { durations, elapsedMs: performance.now() - started };
}

async function cleanupFixtures(): Promise<void> {
  if (!sellerId) {
    const existing = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [fixtureEmail]);
    sellerId = existing.rows[0]?.id ?? '';
  }
  if (sellerId) {
    await pool.query('DELETE FROM users WHERE id = $1', [sellerId]);
  }
}

async function seedFixtures(): Promise<void> {
  await cleanupFixtures();
  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, status, email_verified_at)
     VALUES ($1, 'P1-18 Performance Seller', 'active', now())
     RETURNING id`,
    [fixtureEmail]
  );
  sellerId = user.rows[0]!.id;

  await pool.query(
    `INSERT INTO listings (
       seller_id, title, description, price_amount, currency_code, condition, status,
       country_code, region, city, suburb, allow_pickup, allow_delivery,
       published_at, created_at, updated_at
     )
     SELECT $1,
       'Performance listing ' || series,
       'Database-backed performance fixture for launch certification ' || series,
       125.00,
       'AUD',
       'good',
       'active',
       'AU',
       'NSW',
       'Sydney',
       'Performance',
       true,
       true,
       now() - make_interval(secs => series),
       now() - make_interval(secs => series),
       now() - make_interval(secs => series)
     FROM generate_series(1, 3000) AS series`,
    [sellerId]
  );

  const ids = await pool.query<{ id: string }>(
    `SELECT id FROM listings WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 500`,
    [sellerId]
  );
  listingIds = ids.rows.map((row) => row.id);

  await pool.query(
    `INSERT INTO listing_media (listing_id, object_key, mime_type, width, height, size_bytes, sort_order)
     SELECT id, 'performance/' || id || '/image.webp', 'image/webp', 1024, 768, 65536, 0
     FROM listings
     WHERE seller_id = $1
     ORDER BY created_at DESC
     LIMIT 500`,
    [sellerId]
  );

  await pool.query(
    `INSERT INTO notifications (user_id, event_type, event_family, title, body, dedupe_key)
     SELECT $1, 'performance.queue', 'performance', 'Performance queue', 'Synthetic launch performance notification',
       'p1-18:' || series
     FROM generate_series(1, 500) AS series`,
    [sellerId]
  );
  await pool.query(
    `INSERT INTO notification_deliveries (notification_id, channel, destination, status, next_attempt_at)
     SELECT id, 'email', $1, 'pending', now()
     FROM notifications
     WHERE user_id = $2 AND event_type = 'performance.queue'`,
    [fixtureEmail, sellerId]
  );
}

async function waitForApi(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBaseUrl}/v1/health`);
      if (response.ok) return;
    } catch {
      // retry until deadline
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('API did not become ready for performance testing');
}

async function loadScenario(): Promise<ScenarioResult> {
  const concurrency = 12;
  const { durations, elapsedMs } = await runConcurrent(120, concurrency, async () => {
    const response = await fetch(`${apiBaseUrl}/v1/listings?limit=20`);
    if (!response.ok) throw new Error(`load request failed with ${response.status}`);
    const body = await response.json() as { listings?: unknown[] };
    if (!Array.isArray(body.listings) || body.listings.length !== 20) throw new Error('load response did not contain 20 listings');
  });
  const p95 = percentile(durations, 95);
  const throughput = durations.length / (elapsedMs / 1000);
  return buildResult({
    name: 'load', durations, concurrency, elapsedMs, threshold: thresholds.load,
    passed: p95 <= thresholds.load.p95Ms && throughput >= thresholds.load.minThroughputPerSecond
  });
}

async function concurrencyScenario(): Promise<ScenarioResult> {
  const concurrency = 20;
  const { durations, elapsedMs } = await runConcurrent(100, concurrency, async (index) => {
    const id = listingIds[index % listingIds.length]!;
    await pool.query('UPDATE listings SET updated_at = updated_at WHERE id = $1', [id]);
  });
  const p95 = percentile(durations, 95);
  return buildResult({
    name: 'concurrency', durations, concurrency, elapsedMs, threshold: thresholds.concurrency,
    passed: p95 <= thresholds.concurrency.p95Ms
  });
}

async function paginationScenario(): Promise<ScenarioResult> {
  const durations: number[] = [];
  let cursor: string | null = null;
  const started = performance.now();
  let pages = 0;
  let records = 0;
  for (let index = 0; index < 30; index += 1) {
    const requestStarted = performance.now();
    const url = new URL(`${apiBaseUrl}/v1/listings`);
    url.searchParams.set('limit', '50');
    if (cursor) url.searchParams.set('before', cursor);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`pagination request failed with ${response.status}`);
    const body = await response.json() as { listings: unknown[]; pagination: { hasMore: boolean; nextCursor: string | null } };
    durations.push(performance.now() - requestStarted);
    pages += 1;
    records += body.listings.length;
    cursor = body.pagination.nextCursor;
    if (!body.pagination.hasMore || !cursor) break;
  }
  const elapsedMs = performance.now() - started;
  const p95 = percentile(durations, 95);
  return buildResult({
    name: 'pagination', durations, concurrency: 1, elapsedMs, threshold: thresholds.pagination,
    passed: pages >= 20 && records >= 1000 && p95 <= thresholds.pagination.p95Ms,
    notes: { pages, records }
  });
}

async function mediaScenario(): Promise<ScenarioResult> {
  const fixture = execFileSync('convert', ['-size', '1024x768', 'xc:#d9d9d9', 'png:-']);
  const concurrency = 2;
  const { durations, elapsedMs } = await runConcurrent(8, concurrency, async () => {
    const transformed = await transformListingImage({
      buffer: fixture,
      mimeType: 'image/png',
      width: 1024,
      height: 768,
      orientation: null
    });
    if (transformed.publicImage.buffer.length === 0 || transformed.thumbnail.buffer.length === 0) {
      throw new Error('media transform produced an empty derivative');
    }
  });
  const p95 = percentile(durations, 95);
  return buildResult({
    name: 'media', durations, concurrency, elapsedMs, threshold: thresholds.media,
    passed: p95 <= thresholds.media.p95Ms
  });
}

async function queueScenario(): Promise<ScenarioResult> {
  const concurrency = 8;
  const claimedIds = new Set<string>();
  const started = performance.now();
  const durations = await Promise.all(Array.from({ length: concurrency }, async () => {
    const operationStarted = performance.now();
    const claimed = await claimEnabledNotificationDeliveries({
      channels: ['email'], batchSize: 25, lockTimeoutMs: 60_000
    });
    for (const row of claimed) {
      if (claimedIds.has(row.id)) throw new Error(`queue row claimed more than once: ${row.id}`);
      claimedIds.add(row.id);
    }
    return performance.now() - operationStarted;
  }));
  const elapsedMs = performance.now() - started;
  const p95 = percentile(durations, 95);
  return buildResult({
    name: 'queue', durations, concurrency, elapsedMs, threshold: thresholds.queue,
    passed: p95 <= thresholds.queue.p95Ms && claimedIds.size >= thresholds.queue.minClaimed,
    notes: { claimed: claimedIds.size, duplicateClaims: false }
  });
}

async function paymentEventScenario(): Promise<ScenarioResult> {
  const secret = 'whsec_p1_18_performance_1234567890';
  const timestamp = Math.floor(Date.now() / 1000);
  const event = {
    id: 'evt_performance1234', object: 'event', created: timestamp, livemode: false,
    type: 'payment_intent.succeeded',
    data: { object: {
      id: 'pi_performance1234', object: 'payment_intent', amount: 12500, amount_received: 12500,
      currency: 'aud', status: 'succeeded', latest_charge: 'ch_performance1234',
      transfer_group: 'performance-order', receipt_email: null,
      metadata: {
        suqnaa_order_id: randomUUID(), suqnaa_payment_intent_id: randomUUID(),
        suqnaa_listing_id: randomUUID(), suqnaa_seller_id: randomUUID()
      }
    } }
  } as const;
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
  const signatureHeader = `t=${timestamp},v1=${signature}`;
  const { durations, elapsedMs } = await runConcurrent(1000, 10, async () => {
    const parsed = verifyAndParseStripeWebhook({ rawBody, signatureHeader, webhookSecret: secret, nowMs: timestamp * 1000 });
    if (parsed.type !== 'payment_intent.succeeded') throw new Error('payment event type changed during verification');
  });
  const p95 = percentile(durations, 95);
  const throughput = durations.length / (elapsedMs / 1000);
  return buildResult({
    name: 'payment-event', durations, concurrency: 10, elapsedMs, threshold: thresholds.paymentEvent,
    passed: p95 <= thresholds.paymentEvent.p95Ms && throughput >= thresholds.paymentEvent.minThroughputPerSecond
  });
}

async function databaseScenario(): Promise<ScenarioResult> {
  const concurrency = 20;
  const { durations, elapsedMs } = await runConcurrent(300, concurrency, async (index) => {
    const id = listingIds[index % listingIds.length]!;
    const result = await pool.query('SELECT id, status, price_amount FROM listings WHERE id = $1 AND seller_id = $2', [id, sellerId]);
    if (result.rowCount !== 1) throw new Error('indexed listing lookup missed seeded row');
  });
  const p95 = percentile(durations, 95);
  return buildResult({
    name: 'database', durations, concurrency, elapsedMs, threshold: thresholds.database,
    passed: p95 <= thresholds.database.p95Ms
  });
}

async function main(): Promise<void> {
  const results: ScenarioResult[] = [];
  try {
    await seedFixtures();
    await waitForApi();
    results.push(await loadScenario());
    results.push(await concurrencyScenario());
    results.push(await paginationScenario());
    results.push(await mediaScenario());
    results.push(await queueScenario());
    results.push(await paymentEventScenario());
    results.push(await databaseScenario());

    const report = {
      generatedAt: new Date().toISOString(),
      fixtureScale: { listings: 3000, listingMedia: 500, queueDeliveries: 500 },
      thresholds,
      results,
      passed: results.every((result) => result.passed)
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    for (const result of results) {
      console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}: p95=${result.p95Ms}ms throughput=${result.throughputPerSecond}/s`);
    }
    if (!report.passed) process.exitCode = 1;
  } finally {
    try { await cleanupFixtures(); } finally {
      await Promise.allSettled([pool.end(), closeDb()]);
    }
  }
}

await main();
