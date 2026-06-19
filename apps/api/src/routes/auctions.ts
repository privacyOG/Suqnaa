import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const createAuctionBody = z.object({
  listingId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  startingPrice: z.number().nonnegative(),
  reservePrice: z.number().nonnegative().optional(),
  bidIncrement: z.number().positive().default(1),
  antiSnipingWindowSeconds: z.number().int().min(0).default(120)
});

const bidBody = z.object({
  bidderId: z.string().uuid(),
  amount: z.number().positive(),
  currencyCode: z.string().length(3)
});

export async function auctionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/auctions', async () => ({
    auctions: [],
    note: 'Auction listing endpoint is scaffolded. Persistence and winner settlement jobs are the next implementation step.'
  }));

  app.post('/auctions', async (request, reply) => {
    const body = createAuctionBody.parse(request.body);

    return reply.code(202).send({
      accepted: true,
      auction: body,
      requiredControls: [
        'seller verification',
        'listing risk review',
        'bid increment validation',
        'winner checkout conversion',
        'non-paying winner policy'
      ]
    });
  });

  app.post('/auctions/:auctionId/bids', async (request, reply) => {
    const params = z.object({ auctionId: z.string().uuid() }).parse(request.params);
    const body = bidBody.parse(request.body);

    return reply.code(202).send({
      accepted: true,
      auctionId: params.auctionId,
      bid: body,
      requiredControls: [
        'bidder verification',
        'anti-sniping rules',
        'fraud and shill-bid checks',
        'payment readiness for winning bid'
      ]
    });
  });
}
