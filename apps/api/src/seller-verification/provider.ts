import { z } from 'zod';
import type { SellerVerificationConfiguration } from '../config/seller-verification-config.js';

export type SellerVerificationLevel = 'seller' | 'business';
export type ProviderSessionAction = 'create' | 'resume';

export interface ProviderSessionInput {
  action: ProviderSessionAction;
  checkId: string;
  accountId: string;
  level: SellerVerificationLevel;
  countryCode: string;
  businessName?: string | null;
  reference?: string | null;
}

export interface ProviderSessionResult {
  reference: string;
  hostedUrl: string;
  expiresAt: Date;
}

export interface SellerVerificationProvider {
  readonly name: string;
  createSession(input: ProviderSessionInput): Promise<ProviderSessionResult>;
}

const responseSchema = z.object({
  reference: z.string().trim().min(1).max(200).regex(/^[\x21-\x7e]+$/),
  hostedUrl: z.string().url(),
  expiresAt: z.string().datetime({ offset: true })
}).strict();

function trustedHostedUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
}

export class HttpSellerVerificationProvider implements SellerVerificationProvider {
  constructor(
    private readonly configuration: SellerVerificationConfiguration,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  readonly name = this.configuration.provider;

  async createSession(input: ProviderSessionInput): Promise<ProviderSessionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.configuration.timeoutMs);
    try {
      const response = await this.fetchImpl(this.configuration.endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${this.configuration.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          purpose: 'seller_verification',
          action: input.action,
          requestId: input.checkId,
          accountId: input.accountId,
          level: input.level,
          countryCode: input.countryCode,
          businessName: input.businessName ?? undefined,
          reference: input.reference ?? undefined
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Seller verification provider returned ${response.status}`);
      }
      const parsed = responseSchema.parse(await response.json());
      if (!trustedHostedUrl(parsed.hostedUrl)) {
        throw new Error('Seller verification hosted URL is not secure');
      }
      const expiresAt = new Date(parsed.expiresAt);
      const now = Date.now();
      if (expiresAt.getTime() <= now || expiresAt.getTime() > now + 30 * 24 * 60 * 60 * 1000) {
        throw new Error('Seller verification session expiry is invalid');
      }
      return {
        reference: parsed.reference,
        hostedUrl: parsed.hostedUrl,
        expiresAt
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createSellerVerificationProvider(
  configuration: SellerVerificationConfiguration,
  fetchImpl?: typeof fetch
): SellerVerificationProvider | null {
  if (!configuration.enabled) return null;
  return new HttpSellerVerificationProvider(configuration, fetchImpl);
}
