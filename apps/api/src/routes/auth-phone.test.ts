import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { closeDb, db } from '../db/index.js';
import { authRoutes } from './auth.js';

const app = Fastify();
await app.register(authRoutes, { prefix: '/v1' });
const createdUsers: string[] = [];

try {
  const register = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { 'user-agent': 'PhoneAuthTest/1.0' },
    payload: {
      phone: '+61 412 345 678',
      displayName: 'Phone User',
      password: 'Phone-password-123'
    }
  });
  assert.equal(register.statusCode, 201, register.body);
  const registered = register.json();
  createdUsers.push(registered.user.id);
  assert.equal(registered.user.email, null);
  assert.equal(registered.user.phone, '+61412345678');

  const stored = await db.selectFrom('users')
    .select(['phone_e164'])
    .where('id', '=', registered.user.id)
    .executeTakeFirstOrThrow();
  assert.equal(stored.phone_e164, '+61412345678');

  const duplicate = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { 'user-agent': 'PhoneAuthTest/1.0' },
    payload: {
      phone: '0061 (412) 345-678',
      displayName: 'Duplicate Phone',
      password: 'Phone-password-456'
    }
  });
  assert.equal(duplicate.statusCode, 409, duplicate.body);

  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: { 'user-agent': 'PhoneAuthTest/1.0' },
    payload: {
      phone: '0061 412 345 678',
      password: 'Phone-password-123'
    }
  });
  assert.equal(login.statusCode, 200, login.body);
  assert.equal(login.json().user.phone, '+61412345678');

  const emailAddress = `email-${Date.now()}@example.test`;
  const emailRegister = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { 'user-agent': 'PhoneAuthTest/1.0' },
    payload: {
      email: emailAddress.toUpperCase(),
      displayName: 'Email User',
      password: 'Email-password-123'
    }
  });
  assert.equal(emailRegister.statusCode, 201, emailRegister.body);
  createdUsers.push(emailRegister.json().user.id);

  const emailLogin = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: { 'user-agent': 'PhoneAuthTest/1.0' },
    payload: {
      email: emailAddress.toUpperCase(),
      password: 'Email-password-123'
    }
  });
  assert.equal(emailLogin.statusCode, 200, emailLogin.body);

  console.log('Phone registration and sign-in tests passed.');
} finally {
  await app.close();
  for (const userId of createdUsers) {
    await db.deleteFrom('users').where('id', '=', userId).execute();
  }
  await closeDb();
}
