import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  requireOperationsUser,
  type OperationsRequest
} from '../auth/require-operations-user.js';
import { paymentCollectionConfigurationFromEnvironment } from '../config/payment-collection-config.js';
import {
  PaymentOperationError,
  paymentOperationStatuses
} from '../payments/payment-operation.js';
import {
  decidePaymentOperation,
  listPaymentOperations,
  requestPaymentOperation
} from '../payments/payment-operation-service.js';
import { StripePaymentOperationsProvider } from '../payments/stripe-payment-operations.js';

const uuid = z.string().uuid();
const requestKind = z.enum([
  'release',
  'refund_full',
  'refund_partial',
  'cancel_after_payment',
  'compliance_hold'
]);
const requestBody = z.object({
  kind: requestKind,
  amount: z.union([z.string(), z.number()]).optional(),
  reason: z.string().min(8).max(2000)
}).strict();
const decisionBody = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().min(8).max(2000)
}).strict();
const listQuery = z.object({
  orderId: uuid.optional(),
  status: z.enum(paymentOperationStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
}).strict();

function operationError(reply: any, error: unknown) {
  if (error instanceof PaymentOperationError) {
    return reply.code(error.statusCode).send({ error: 'Payment operation rejected', code: error.code });
  }
  throw error;
}

export async function operationsPaymentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/operations/payments', { preHandler: requireOperationsUser }, async (request, reply) => {
    const query = listQuery.parse(request.query);
    return reply.send({ operations: await listPaymentOperations(query) });
  });

  app.post('/operations/payments/:orderId/request', { preHandler: requireOperationsUser }, async (request, reply) => {
    const authRequest = request as OperationsRequest;
    const params = z.object({ orderId: uuid }).parse(request.params);
    const body = requestBody.parse(request.body);
    try {
      const operation = await requestPaymentOperation({
        orderId: params.orderId,
        kind: body.kind,
        amount: body.amount,
        reason: body.reason,
        requestedBy: authRequest.operationsUserId,
        ipAddress: request.ip
      });
      return reply.code(201).send({ operation });
    } catch (error) {
      return operationError(reply, error);
    }
  });

  app.post('/operations/payment-operations/:operationId/decision', { preHandler: requireOperationsUser }, async (request, reply) => {
    const authRequest = request as OperationsRequest;
    const params = z.object({ operationId: uuid }).parse(request.params);
    const body = decisionBody.parse(request.body);
    const provider = new StripePaymentOperationsProvider(
      paymentCollectionConfigurationFromEnvironment()
    );
    try {
      const result = await decidePaymentOperation({
        operationId: params.operationId,
        decision: body.decision,
        decidedBy: authRequest.operationsUserId,
        decisionReason: body.reason,
        provider,
        ipAddress: request.ip
      });
      return reply.send(result);
    } catch (error) {
      return operationError(reply, error);
    }
  });
}
