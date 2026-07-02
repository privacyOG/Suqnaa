import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    reply.header('Cache-Control', 'private, no-cache');
    return {
      ok: true,
      service: 'suqnaa-api'
    };
  });
}
