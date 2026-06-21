import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  PASSWORD_PEPPER: z.string().min(32),
  CHALLENGE_PROVIDER: z.enum(['none', 'turnstile']).default('none'),
  TURNSTILE_SECRET_KEY: z.string().optional().default(''),
  TURNSTILE_EXPECTED_HOSTNAME: z.string().optional().default(''),
  TURNSTILE_TIMEOUT_MS: z.coerce.number().int().min(500).max(15000).default(5000),
  ASSISTANT_ENABLED: z.coerce.boolean().default(false),
  ASSISTANT_PROVIDER: z.enum(['none', 'remote', 'local']).default('none'),
  ASSISTANT_BASE_URL: z.string().optional().default(''),
  ASSISTANT_API_KEY: z.string().optional().default('')
});

export const env = schema.parse(process.env);
