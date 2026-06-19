import argon2 from 'argon2';
import { env } from '../config/env.js';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password + env.PASSWORD_PEPPER, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password + env.PASSWORD_PEPPER);
}
