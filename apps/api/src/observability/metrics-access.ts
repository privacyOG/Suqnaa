import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

const minimumProductionTokenLength = 32;

export class MetricsAccessConfigurationError extends Error {}

export function resolveMetricsAccessToken(input: {
  nodeEnv?: string;
  token?: string;
}): string | null {
  const token = input.token?.trim() || '';
  if (input.nodeEnv === 'production' && token.length < minimumProductionTokenLength) {
    throw new MetricsAccessConfigurationError(
      `observability metrics token must contain at least ${minimumProductionTokenLength} characters in production`
    );
  }
  return token || null;
}

export function loadMetricsAccessToken(input: {
  nodeEnv?: string;
  token?: string;
  tokenFile?: string;
}): string | null {
  const tokenFile = input.tokenFile?.trim();
  let token = input.token;
  if (tokenFile) {
    try {
      token = readFileSync(tokenFile, 'utf8');
    } catch {
      throw new MetricsAccessConfigurationError('observability metrics token file could not be read');
    }
  }
  return resolveMetricsAccessToken({ nodeEnv: input.nodeEnv, token });
}

export function metricsAuthorizationAllowed(
  authorization: string | string[] | undefined,
  expectedToken: string | null
): boolean {
  if (!expectedToken) return true;
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!header?.startsWith('Bearer ')) return false;
  const supplied = header.slice('Bearer '.length).trim();
  const expectedBuffer = Buffer.from(expectedToken);
  const suppliedBuffer = Buffer.from(supplied);
  return suppliedBuffer.length === expectedBuffer.length
    && timingSafeEqual(suppliedBuffer, expectedBuffer);
}
