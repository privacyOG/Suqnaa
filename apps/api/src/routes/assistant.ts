import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runAssistant } from '../services/assistant.js';

const assistantBody = z.object({
  locale: z.enum(['en', 'ar']).default('en'),
  purpose: z.enum(['listing_draft', 'buyer_help', 'safety_help']),
  message: z.string().trim().min(3).max(4000)
});

export async function assistantRoutes(app: FastifyInstance): Promise<void> {
  app.post('/assistant', async (request) => {
    const body = assistantBody.parse(request.body);
    const response = await runAssistant(body);

    return { assistant: response };
  });
}
