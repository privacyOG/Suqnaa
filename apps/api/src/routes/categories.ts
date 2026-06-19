import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';

export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/categories', async () => {
    const categories = await db.selectFrom('categories')
      .select(['id', 'parent_id', 'slug', 'name_en', 'name_ar', 'sort_order'])
      .where('is_active', '=', true)
      .orderBy('sort_order', 'asc')
      .orderBy('name_en', 'asc')
      .execute();

    return { categories };
  });
}
