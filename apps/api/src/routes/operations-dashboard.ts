import type { FastifyInstance } from 'fastify';
import { requireOperationsUser, type OperationsRequest } from '../auth/require-operations-user.js';
import { db } from '../db/index.js';

function asCount(row: { count?: string | number | bigint | null } | undefined): number {
  return Number(row?.count ?? 0);
}

export async function operationsDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/operations/dashboard', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const permissions = auth.administrativePermissions;
    const can = (permission: string) => permissions.has(permission);

    const [openReports, suspendedAccounts, removedListings, categories, pendingVerifications, activeDisputes,
      pendingPaymentOperations, failedPaymentOperations, blockedSettlements, failedFulfilments, activeReturns,
      fraudReports, chargebacks, auditLast24Hours] = await Promise.all([
      can('moderation.queue.read') ? db.selectFrom('reports').select((eb) => eb.fn.countAll().as('count')).where('resolved_at', 'is', null).executeTakeFirst() : undefined,
      can('moderation.account.manage') ? db.selectFrom('users').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'suspended').executeTakeFirst() : undefined,
      can('moderation.listing.manage') ? db.selectFrom('listings').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'removed').executeTakeFirst() : undefined,
      db.selectFrom('categories').select((eb) => eb.fn.countAll().as('count')).executeTakeFirst(),
      can('verification.read') ? db.selectFrom('verification_checks').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'pending').executeTakeFirst() : undefined,
      can('disputes.read') ? db.selectFrom('disputes').select((eb) => eb.fn.countAll().as('count')).where('status', 'not in', ['resolved', 'closed']).executeTakeFirst() : undefined,
      can('payments.read') ? db.selectFrom('payment_operations').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'requested').executeTakeFirst() : undefined,
      can('payments.read') ? db.selectFrom('payment_operations').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'failed').executeTakeFirst() : undefined,
      can('settlements.read') ? db.selectFrom('seller_settlements').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'blocked').executeTakeFirst() : undefined,
      can('disputes.read') ? db.selectFrom('fulfilments').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'failed').executeTakeFirst() : undefined,
      can('disputes.read') ? db.selectFrom('order_returns').select((eb) => eb.fn.countAll().as('count')).where('status', 'not in', ['completed', 'cancelled', 'expired']).executeTakeFirst() : undefined,
      can('moderation.queue.read') ? db.selectFrom('reports').select((eb) => eb.fn.countAll().as('count')).where('resolved_at', 'is', null).where('reason', 'ilike', '%fraud%').executeTakeFirst() : undefined,
      can('payments.read') ? db.selectFrom('payment_operations').select((eb) => eb.fn.countAll().as('count')).where('kind', '=', 'chargeback').where('status', 'not in', ['rejected', 'succeeded']).executeTakeFirst() : undefined,
      can('audit.read') ? db.selectFrom('audit_logs').select((eb) => eb.fn.countAll().as('count')).where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000)).executeTakeFirst() : undefined
    ]);

    return reply.send({
      generatedAt: new Date().toISOString(),
      permissions: [...permissions].sort(),
      sections: {
        reports: { available: can('moderation.queue.read'), open: can('moderation.queue.read') ? asCount(openReports) : null },
        accounts: { available: can('moderation.account.manage'), suspended: can('moderation.account.manage') ? asCount(suspendedAccounts) : null },
        listings: { available: can('moderation.listing.manage'), removed: can('moderation.listing.manage') ? asCount(removedListings) : null },
        categories: { available: true, total: asCount(categories) },
        identityChecks: { available: can('verification.read'), pending: can('verification.read') ? asCount(pendingVerifications) : null },
        disputes: { available: can('disputes.read'), active: can('disputes.read') ? asCount(activeDisputes) : null },
        payments: { available: can('payments.read'), awaitingDecision: can('payments.read') ? asCount(pendingPaymentOperations) : null, failed: can('payments.read') ? asCount(failedPaymentOperations) : null },
        settlements: { available: can('settlements.read'), blocked: can('settlements.read') ? asCount(blockedSettlements) : null },
        fulfilment: { available: can('disputes.read'), failed: can('disputes.read') ? asCount(failedFulfilments) : null, activeReturns: can('disputes.read') ? asCount(activeReturns) : null },
        fraudSignals: {
          available: can('moderation.queue.read') || can('payments.read'),
          openFraudReports: can('moderation.queue.read') ? asCount(fraudReports) : null,
          openChargebacks: can('payments.read') ? asCount(chargebacks) : null,
          source: 'existing_reports_and_chargebacks'
        },
        audit: { available: can('audit.read'), last24Hours: can('audit.read') ? asCount(auditLast24Hours) : null }
      }
    });
  });

  app.get('/operations/dashboard/accounts', { preHandler: requireOperationsUser }, async (_request, reply) => {
    const rows = await db.selectFrom('users')
      .leftJoin('user_profiles', 'user_profiles.user_id', 'users.id')
      .select([
        'users.id as id', 'users.display_name as display_name', 'users.status as status',
        'users.email_verified_at as email_verified_at', 'users.phone_verified_at as phone_verified_at',
        'users.created_at as created_at', 'users.updated_at as updated_at',
        'user_profiles.trust_score as trust_score', 'user_profiles.is_business as is_business',
        'user_profiles.business_name as business_name', 'user_profiles.country_code as country_code'
      ])
      .orderBy('users.updated_at', 'desc').limit(200).execute();
    return reply.send({ accounts: rows.map((row) => ({
      id: row.id, displayName: row.display_name, status: row.status,
      emailVerified: Boolean(row.email_verified_at), phoneVerified: Boolean(row.phone_verified_at),
      trustScore: row.trust_score, business: Boolean(row.is_business), businessName: row.business_name,
      countryCode: row.country_code, createdAt: row.created_at, updatedAt: row.updated_at
    })) });
  });

  app.get('/operations/dashboard/listings', { preHandler: requireOperationsUser }, async (_request, reply) => {
    const rows = await db.selectFrom('listings')
      .leftJoin('users', 'users.id', 'listings.seller_id')
      .leftJoin('categories', 'categories.id', 'listings.category_id')
      .select([
        'listings.id as id', 'listings.title as title', 'listings.status as status',
        'listings.price_amount as price_amount', 'listings.currency_code as currency_code',
        'listings.condition as condition', 'listings.country_code as country_code',
        'listings.city as city', 'listings.published_at as published_at', 'listings.expires_at as expires_at',
        'listings.created_at as created_at', 'listings.updated_at as updated_at',
        'users.id as seller_id', 'users.display_name as seller_name', 'users.status as seller_status',
        'categories.slug as category_slug', 'categories.name_en as category_name_en', 'categories.name_ar as category_name_ar'
      ])
      .orderBy('listings.updated_at', 'desc').limit(200).execute();
    return reply.send({ listings: rows.map((row) => ({
      id: row.id, title: row.title, status: row.status, priceAmount: row.price_amount,
      currencyCode: row.currency_code, condition: row.condition, countryCode: row.country_code,
      city: row.city, publishedAt: row.published_at, expiresAt: row.expires_at,
      seller: { id: row.seller_id, displayName: row.seller_name, status: row.seller_status },
      category: row.category_slug ? { slug: row.category_slug, nameEn: row.category_name_en, nameAr: row.category_name_ar } : null,
      createdAt: row.created_at, updatedAt: row.updated_at
    })) });
  });

  app.get('/operations/dashboard/categories', { preHandler: requireOperationsUser }, async (_request, reply) => {
    const rows = await db.selectFrom('categories')
      .select(['id', 'parent_id', 'slug', 'name_en', 'name_ar', 'sort_order', 'is_active'])
      .orderBy('sort_order', 'asc').orderBy('name_en', 'asc').execute();
    return reply.send({ categories: rows.map((row) => ({
      id: row.id, parentId: row.parent_id, slug: row.slug, nameEn: row.name_en, nameAr: row.name_ar,
      sortOrder: row.sort_order, active: Boolean(row.is_active)
    })) });
  });

  app.get('/operations/dashboard/fulfilment', { preHandler: requireOperationsUser }, async (_request, reply) => {
    const [fulfilments, returns] = await Promise.all([
      db.selectFrom('fulfilments')
        .innerJoin('payment_intents', 'payment_intents.id', 'fulfilments.payment_intent_id')
        .leftJoin('transactions', 'transactions.id', 'payment_intents.transaction_id')
        .leftJoin('listings', 'listings.id', 'payment_intents.listing_id')
        .select([
          'fulfilments.id as id', 'fulfilments.status as status', 'fulfilments.carrier as carrier',
          'fulfilments.tracking_reference as tracking_reference', 'fulfilments.shipped_at as shipped_at',
          'fulfilments.delivered_at as delivered_at', 'fulfilments.buyer_confirmed_at as buyer_confirmed_at',
          'fulfilments.updated_at as updated_at', 'payment_intents.transaction_id as order_id',
          'payment_intents.status as payment_status', 'transactions.status as order_status', 'listings.title as listing_title'
        ]).orderBy('fulfilments.updated_at', 'desc').limit(100).execute(),
      db.selectFrom('order_returns')
        .leftJoin('transactions', 'transactions.id', 'order_returns.order_id')
        .leftJoin('listings', 'listings.id', 'transactions.listing_id')
        .select([
          'order_returns.id as id', 'order_returns.order_id as order_id', 'order_returns.dispute_id as dispute_id',
          'order_returns.status as status', 'order_returns.reason as reason', 'order_returns.return_due_at as return_due_at',
          'order_returns.carrier as carrier', 'order_returns.tracking_reference as tracking_reference',
          'order_returns.shipped_at as shipped_at', 'order_returns.delivered_at as delivered_at',
          'order_returns.received_at as received_at', 'order_returns.seller_condition as seller_condition',
          'order_returns.updated_at as updated_at', 'listings.title as listing_title'
        ]).orderBy('order_returns.updated_at', 'desc').limit(100).execute()
    ]);
    return reply.send({
      fulfilments: fulfilments.map((row) => ({
        id: row.id, orderId: row.order_id, status: row.status, paymentStatus: row.payment_status,
        orderStatus: row.order_status, listingTitle: row.listing_title, carrier: row.carrier,
        trackingReference: row.tracking_reference, shippedAt: row.shipped_at, deliveredAt: row.delivered_at,
        buyerConfirmedAt: row.buyer_confirmed_at, updatedAt: row.updated_at
      })),
      returns: returns.map((row) => ({
        id: row.id, orderId: row.order_id, disputeId: row.dispute_id, status: row.status,
        listingTitle: row.listing_title, reason: row.reason, returnDueAt: row.return_due_at,
        carrier: row.carrier, trackingReference: row.tracking_reference, shippedAt: row.shipped_at,
        deliveredAt: row.delivered_at, receivedAt: row.received_at, sellerCondition: row.seller_condition,
        updatedAt: row.updated_at
      }))
    });
  });

  app.get('/operations/dashboard/fraud', { preHandler: requireOperationsUser }, async (request, reply) => {
    const auth = request as OperationsRequest;
    const canReports = auth.administrativePermissions.has('moderation.queue.read');
    const canPayments = auth.administrativePermissions.has('payments.read');
    const [reports, chargebacks] = await Promise.all([
      canReports ? db.selectFrom('reports')
        .select(['id', 'listing_id', 'reported_user_id', 'reason', 'details', 'created_at'])
        .where('resolved_at', 'is', null).where('reason', 'ilike', '%fraud%')
        .orderBy('created_at', 'desc').limit(100).execute() : [],
      canPayments ? db.selectFrom('payment_operations')
        .select(['id', 'order_id', 'status', 'amount', 'currency_code', 'reason', 'requested_at'])
        .where('kind', '=', 'chargeback').orderBy('requested_at', 'desc').limit(100).execute() : []
    ]);
    return reply.send({
      source: 'existing_reports_and_chargebacks', automatedRiskRules: false,
      reports: reports.map((row) => ({ id: row.id, listingId: row.listing_id, subjectUserId: row.reported_user_id, reason: row.reason, details: row.details, createdAt: row.created_at })),
      chargebacks: chargebacks.map((row) => ({ id: row.id, orderId: row.order_id, status: row.status, amount: row.amount, currencyCode: row.currency_code, reason: row.reason, requestedAt: row.requested_at }))
    });
  });
}
