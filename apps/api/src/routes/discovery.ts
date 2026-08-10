import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import {
  createSavedSearch,
  deleteSavedSearch,
  DiscoveryConflictError,
  DiscoveryLimitError,
  DiscoveryNotFoundError,
  getListingDiscoveryState,
  listRecentlyViewed,
  listSavedListings,
  listSavedSearchNotifications,
  listSavedSearches,
  listWatchlist,
  markAllSavedSearchNotificationsRead,
  markSavedSearchNotificationRead,
  recordRecentlyViewed,
  removeSavedListing,
  removeWatchedListing,
  saveListing,
  updateSavedSearch,
  watchListing
} from '../discovery/discovery-service.js';
import { rateLimitResponse } from '../security/rate-limit.js';
import { checkSharedRateLimit } from '../security/shared-rate-limit.js';

const listingParams = z.object({ listingId: z.string().uuid() });
const searchParams = z.object({ searchId: z.string().uuid() });
const notificationParams = z.object({ notificationId: z.string().uuid() });
const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
}).strict();
const notificationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  unreadOnly: z.enum(['true', 'false']).transform((value) => value === 'true').default('false')
}).strict();
const savedSearchBody = z.object({
  name: z.string().trim().min(1).max(120),
  filters: z.record(z.unknown())
}).strict();
const savedSearchUpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  filters: z.record(z.unknown()).optional(),
  active: z.boolean().optional()
}).strict().refine(
  (value) => value.name !== undefined || value.filters !== undefined || value.active !== undefined,
  { message: 'At least one saved search field is required' }
);

async function enforceDiscoveryLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string,
  mutation: boolean
): Promise<boolean> {
  const accountLimit = await checkSharedRateLimit({
    group: mutation ? 'discovery.mutation.account' : 'discovery.read.account',
    identifiers: [`account:${accountId}`],
    limit: mutation ? 240 : 600,
    windowMs: 5 * 60 * 1000
  });
  const ipLimit = await checkSharedRateLimit({
    group: mutation ? 'discovery.mutation.ip' : 'discovery.read.ip',
    identifiers: [`ip:${request.ip}`],
    limit: mutation ? 600 : 1200,
    windowMs: 5 * 60 * 1000
  });
  const limited = !accountLimit.allowed ? accountLimit : !ipLimit.allowed ? ipLimit : undefined;
  if (!limited) return true;

  reply.header('Retry-After', String(limited.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limited));
  return false;
}

function discoveryFailure(reply: FastifyReply, error: unknown) {
  if (error instanceof DiscoveryNotFoundError) {
    return reply.code(404).send({ error: error.message });
  }
  if (error instanceof DiscoveryConflictError || error instanceof DiscoveryLimitError) {
    return reply.code(409).send({ error: error.message });
  }
  throw error;
}

export async function discoveryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/discovery/listings/:listingId/state', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, false)) return;
    const params = listingParams.parse(request.params);
    try {
      return reply.send({ state: await getListingDiscoveryState(authRequest.user.sub, params.listingId) });
    } catch (error) {
      return discoveryFailure(reply, error);
    }
  });

  app.get('/discovery/saved-listings', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, false)) return;
    const query = pageQuery.parse(request.query);
    return reply.send({ items: await listSavedListings(authRequest.user.sub, query.limit) });
  });

  app.post('/discovery/saved-listings/:listingId/save', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, true)) return;
    const params = listingParams.parse(request.params);
    try {
      return reply.send({ saved: await saveListing(authRequest.user.sub, params.listingId) });
    } catch (error) {
      return discoveryFailure(reply, error);
    }
  });

  app.post('/discovery/saved-listings/:listingId/remove', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, true)) return;
    const params = listingParams.parse(request.params);
    return reply.send({ saved: await removeSavedListing(authRequest.user.sub, params.listingId) });
  });

  app.get('/discovery/watchlist', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, false)) return;
    const query = pageQuery.parse(request.query);
    return reply.send({ items: await listWatchlist(authRequest.user.sub, query.limit) });
  });

  app.post('/discovery/watchlist/:listingId/watch', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, true)) return;
    const params = listingParams.parse(request.params);
    try {
      return reply.send({ watched: await watchListing(authRequest.user.sub, params.listingId) });
    } catch (error) {
      return discoveryFailure(reply, error);
    }
  });

  app.post('/discovery/watchlist/:listingId/remove', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, true)) return;
    const params = listingParams.parse(request.params);
    return reply.send({ watched: await removeWatchedListing(authRequest.user.sub, params.listingId) });
  });

  app.get('/discovery/recently-viewed', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, false)) return;
    const query = pageQuery.parse(request.query);
    return reply.send({ items: await listRecentlyViewed(authRequest.user.sub, query.limit) });
  });

  app.post('/discovery/recently-viewed/:listingId/view', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, true)) return;
    const params = listingParams.parse(request.params);
    try {
      return reply.send({ recent: await recordRecentlyViewed(authRequest.user.sub, params.listingId) });
    } catch (error) {
      return discoveryFailure(reply, error);
    }
  });

  app.get('/discovery/saved-searches', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, false)) return;
    return reply.send({ searches: await listSavedSearches(authRequest.user.sub) });
  });

  app.post('/discovery/saved-searches', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, true)) return;
    const body = savedSearchBody.parse(request.body);
    try {
      return reply.code(201).send({
        search: await createSavedSearch(authRequest.user.sub, body)
      });
    } catch (error) {
      return discoveryFailure(reply, error);
    }
  });

  app.post('/discovery/saved-searches/:searchId/update', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, true)) return;
    const params = searchParams.parse(request.params);
    const body = savedSearchUpdateBody.parse(request.body);
    try {
      return reply.send({
        search: await updateSavedSearch(authRequest.user.sub, params.searchId, body)
      });
    } catch (error) {
      return discoveryFailure(reply, error);
    }
  });

  app.post('/discovery/saved-searches/:searchId/delete', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, true)) return;
    const params = searchParams.parse(request.params);
    try {
      return reply.send({ deleted: await deleteSavedSearch(authRequest.user.sub, params.searchId) });
    } catch (error) {
      return discoveryFailure(reply, error);
    }
  });

  app.get('/discovery/notifications', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, false)) return;
    const query = notificationQuery.parse(request.query);
    return reply.send({
      notifications: await listSavedSearchNotifications(authRequest.user.sub, query)
    });
  });

  app.post('/discovery/notifications/:notificationId/read', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, true)) return;
    const params = notificationParams.parse(request.params);
    try {
      return reply.send({
        notification: await markSavedSearchNotificationRead(
          authRequest.user.sub,
          params.notificationId
        )
      });
    } catch (error) {
      return discoveryFailure(reply, error);
    }
  });

  app.post('/discovery/notifications/read-all', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!await enforceDiscoveryLimit(request, reply, authRequest.user.sub, true)) return;
    return reply.send({
      result: await markAllSavedSearchNotificationsRead(authRequest.user.sub)
    });
  });
}
