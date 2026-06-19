import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { hashPassword, verifyPassword } from '../security/password.js';

const registerBody = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(8).max(20).optional(),
  displayName: z.string().trim().min(2).max(80),
  password: z.string().min(10).max(200)
}).refine((value) => value.email || value.phone, 'Email or phone is required');

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200)
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', async (request, reply) => {
    const body = registerBody.parse(request.body);
    const passwordHash = await hashPassword(body.password);

    const existing = body.email
      ? await db.selectFrom('users').select(['id']).where('email', '=', body.email.toLowerCase()).executeTakeFirst()
      : undefined;

    if (existing) {
      return reply.code(409).send({ error: 'Account already exists' });
    }

    const user = await db.insertInto('users')
      .values({
        email: body.email?.toLowerCase() ?? null,
        phone_e164: body.phone ?? null,
        display_name: body.displayName,
        password_hash: passwordHash,
        status: 'pending'
      })
      .returning(['id', 'email', 'phone_e164', 'display_name', 'status'])
      .executeTakeFirstOrThrow();

    return reply.code(201).send({ user });
  });

  app.post('/auth/login', async (request, reply) => {
    const body = loginBody.parse(request.body);
    const user = await db.selectFrom('users')
      .select(['id', 'email', 'display_name', 'password_hash', 'status'])
      .where('email', '=', body.email.toLowerCase())
      .executeTakeFirst();

    if (!user?.password_hash) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await verifyPassword(user.password_hash, body.password);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        status: user.status
      }
    });
  });
}
