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

    const [
      openReports,
      suspendedAccounts,
      removedListings,
      categories,
      pendingVerifications,
      activeDisputes,
      pendingPaymentOperations,
      failedPaymentOperations,
      blockedSettlements,
      failedFulfilments,
      activeReturns,
      fraudReports,
      chargebacks,
      auditLast24Hours
    ] = await Promise.all([
      can('moderation.queue.read')
        ? db.selectFrom('reports').select((eb) => eb.fn.countAll().as('count')).where('resolved_at', 'is', null).executeTakeFirst()
        : undefined,
      can('moderation.account.manage')
        ? db.selectFrom('users').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'suspended').executeTakeFirst()
        : undefined,
      can('moderation.listing.manage')
        ? db.selectFrom('listings').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'removed').executeTakeFirst()
        : undefined,
      db.selectFrom('categories').select((eb) => eb.fn.countAll().as('count')).executeTakeFirst(),
      can('verification.read')
        ? db.selectFrom('verification_checks').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'pending').executeTakeFirst()
        : undefined,
      can('disputes.read')
        ? db.selectFrom('disputes').select((eb) => eb.fn.countAll().as('count')).where('status', 'not in', ['resolved', 'closed']).executeTakeFirst()
        : undefined,
      can('payments.read')
        ? db.selectFrom('payment_operations').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'requested').executeTakeFirst()
        : undefined,
      can('payments.read')
        ? db.selectFrom('payment_operations').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'failed').executeTakeFirst()
        : undefined,
      can('settlements.read')
        ? db.selectFrom('seller_settlements').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'blocked').executeTakeFirst()
        : undefined,
      can('disputes.read')
        ? db.selectFrom('fulfilments').select((eb) => eb.fn.countAll().as('count')).where('status', '=', 'failed').executeTakeFirst()
        : undefined,
      can('disputes.read')
        ? db.selectFrom('order_returns').select((eb) => eb.fn.countAll().as('count')).where('status', 'not in', ['completed', 'cancelled', 'expired']).executeTakeFirst()
        : undefined,
      can('moderation.queue.read')
        ? db.selectFrom('reports').select((eb) => eb.fn.countAll().as('count')).where('resolved_at', 'is', null).where('reason', 'ilike', '%fraud%').executeTakeFirst()
        : undefined,
      can('payments.read')
        ? db.selectFrom('payment_operations').select((eb) => eb.fn.countAll().as('count')).where('kind', '=', 'chargeback').where('status', 'not in', ['rejected', 'succeeded']).executeTakeFirst()
        : undefined,
      can('audit.read')
        ? db.selectFrom('audit_logs').select((eb) => eb.fn.countAll().as('count')).where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000)).executeTakeFirst()
        : undefined
    ]);

    return reply.send({
      generatedAt: new Date().toISOString(),
      permissions: [...permissions].sort(),
      sections: {
        reports: {
          available: can('moderation.queue.read'),
          open: can('moderation.queue.read') ? asCount(openReports) : null
        },
        accounts: {
          available: can('moderation.account.manage'),
          suspended: can('moderation.account.manage') ? asCount(suspendedAccounts) : null
        },
        listings: {
          available: can('moderation.listing.manage'),
          removed: can('moderation.listing.manage') ? asCount(removedListings) : null
        },
        categories: {
          available: true,
          total: asCount(categories)
        },
        identityChecks: {
          available: can('verification.read'),
          pending: can('verification.read') ? asCount(pendingVerifications) : null
        },
        disputes: {
          available: can('disputes.read'),
          active: can('disputes.read') ? asCount(activeDisputes) : null
        },
        payments: {
          available: can('payments.read'),
          awaitingDecision: can('payments.read') ? asCount(pendingPaymentOperations) : null,
          failed: can('payments.read') ? asCount(failedPaymentOperations) : null
        },
        settlements: {
          available: can('settlements.read'),
          blocked: can('settlements.read') ? asCount(blockedSettlements) : null
        },
        fulfilment: {
          available: can('disputes.read'),
          failed: can('disputes.read') ? asCount(failedFulfilments) : null,
          activeReturns: can('disputes.read') ? asCount(activeReturns) : null
        },
        fraudSignals: {
          available: can('moderation.queue.read') || can('payments.read'),
          openFraudReports: can('moderation.queue.read') ? asCount(fraudReports) : null,
          openChargebacks: can('payments.read') ? asCount(chargebacks) : null,
          source: 'existing_reports_and_chargebacks'
        },
        audit: {
          available: can('audit.read'),
          last24Hours: can('audit.read') ? asCount(auditLast24Hours) : null
        }
      }
    });
  });
}
