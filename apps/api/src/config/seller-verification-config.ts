export interface SellerVerificationConfigurationInput {
  provider?: string;
  endpoint?: string;
  token?: string;
  signingSecret?: string;
  timeoutMs?: number;
  eventMaxAgeSeconds?: number;
  verifiedValidityDays?: number;
  nodeEnv?: string;
}

export interface SellerVerificationConfiguration {
  enabled: boolean;
  provider: string;
  endpoint: string;
  token: string;
  signingSecret: string;
  timeoutMs: number;
  eventMaxAgeSeconds: number;
  verifiedValidityDays: number;
}

const providerPattern = /^[a-z0-9][a-z0-9_-]{1,39}$/;

function validEndpoint(value: string, nodeEnv: string): boolean {
  if (!value) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
  const secure = parsed.protocol === 'https:';
  const localHttp = nodeEnv !== 'production' && local && parsed.protocol === 'http:';
  return (secure || localHttp) && !parsed.username && !parsed.password && !parsed.hash && !parsed.search;
}

export function resolveSellerVerificationConfiguration(
  input: SellerVerificationConfigurationInput
): SellerVerificationConfiguration {
  const provider = (input.provider ?? 'none').trim().toLowerCase();
  const endpoint = input.endpoint?.trim() ?? '';
  const token = input.token?.trim() ?? '';
  const signingSecret = input.signingSecret?.trim() ?? '';
  const timeoutMs = input.timeoutMs ?? 5000;
  const eventMaxAgeSeconds = input.eventMaxAgeSeconds ?? 300;
  const verifiedValidityDays = input.verifiedValidityDays ?? 365;
  const nodeEnv = input.nodeEnv ?? 'development';

  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 15000) {
    throw new Error('SELLER_VERIFICATION_TIMEOUT_MS must be an integer from 500 to 15000');
  }
  if (!Number.isInteger(eventMaxAgeSeconds) || eventMaxAgeSeconds < 30 || eventMaxAgeSeconds > 900) {
    throw new Error('SELLER_VERIFICATION_EVENT_MAX_AGE_SECONDS must be an integer from 30 to 900');
  }
  if (!Number.isInteger(verifiedValidityDays) || verifiedValidityDays < 30 || verifiedValidityDays > 730) {
    throw new Error('SELLER_VERIFICATION_VALID_DAYS must be an integer from 30 to 730');
  }

  if (provider === 'none') {
    if (endpoint || token || signingSecret) {
      throw new Error('Seller verification provider settings require an enabled provider');
    }
    return {
      enabled: false,
      provider: 'none',
      endpoint: '',
      token: '',
      signingSecret: '',
      timeoutMs,
      eventMaxAgeSeconds,
      verifiedValidityDays
    };
  }

  if (!providerPattern.test(provider)) {
    throw new Error('SELLER_VERIFICATION_PROVIDER must be a safe provider identifier');
  }
  if (!validEndpoint(endpoint, nodeEnv)) {
    throw new Error('SELLER_VERIFICATION_URL must be a trusted provider endpoint');
  }
  if (token.length < 16 || token.length > 1024) {
    throw new Error('SELLER_VERIFICATION_TOKEN must contain 16 to 1024 characters');
  }
  if (signingSecret.length < 32 || signingSecret.length > 512) {
    throw new Error('SELLER_VERIFICATION_SIGNING_SECRET must contain 32 to 512 characters');
  }

  return {
    enabled: true,
    provider,
    endpoint,
    token,
    signingSecret,
    timeoutMs,
    eventMaxAgeSeconds,
    verifiedValidityDays
  };
}
