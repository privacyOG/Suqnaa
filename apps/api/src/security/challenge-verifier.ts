import { randomUUID } from 'node:crypto';

export interface ChallengeVerificationInput {
  response?: string;
  remoteIp?: string;
  action?: string;
}

export interface ChallengeVerificationResult {
  success: boolean;
  provider: string;
  reasonCodes: string[];
}

export interface ChallengeVerifier {
  verify(input: ChallengeVerificationInput): Promise<ChallengeVerificationResult>;
}

export interface TurnstileChallengeVerifierOptions {
  secretKey: string;
  expectedHostname?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ChallengeVerifierFactoryOptions {
  provider: 'none' | 'turnstile';
  secretKey?: string;
  expectedHostname?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const defaultTurnstileEndpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const maximumChallengeResponseLength = 2048;

function failure(provider: string, ...reasonCodes: string[]): ChallengeVerificationResult {
  return {
    success: false,
    provider,
    reasonCodes
  };
}

function providerReasonCode(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized ? `turnstile_${normalized}` : 'turnstile_rejected';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function toTurnstileAction(action: string): string {
  return action
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

export class NoopChallengeVerifier implements ChallengeVerifier {
  async verify(input: ChallengeVerificationInput): Promise<ChallengeVerificationResult> {
    const reasonCodes = input.response
      ? ['challenge_provider_not_configured']
      : ['missing_challenge_response', 'challenge_provider_not_configured'];

    return failure('noop', ...reasonCodes);
  }
}

export class TurnstileChallengeVerifier implements ChallengeVerifier {
  private readonly secretKey: string;
  private readonly expectedHostname?: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TurnstileChallengeVerifierOptions) {
    this.secretKey = options.secretKey;
    this.expectedHostname = options.expectedHostname?.trim() || undefined;
    this.endpoint = options.endpoint ?? defaultTurnstileEndpoint;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async verify(input: ChallengeVerificationInput): Promise<ChallengeVerificationResult> {
    const challengeResponse = input.response?.trim();
    if (!challengeResponse) {
      return failure('turnstile', 'missing_challenge_response');
    }

    if (challengeResponse.length > maximumChallengeResponseLength) {
      return failure('turnstile', 'challenge_response_too_long');
    }

    const expectedAction = input.action ? toTurnstileAction(input.action) : undefined;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          secret: this.secretKey,
          response: challengeResponse,
          ...(input.remoteIp ? { remoteip: input.remoteIp } : {}),
          idempotency_key: randomUUID()
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return failure('turnstile', 'turnstile_http_error');
      }

      const payload: unknown = await response.json();
      if (!isRecord(payload) || typeof payload.success !== 'boolean') {
        return failure('turnstile', 'turnstile_invalid_response');
      }

      if (!payload.success) {
        const reasonCodes = stringArray(payload['error-codes']).map(providerReasonCode);
        return failure(
          'turnstile',
          ...(reasonCodes.length > 0 ? reasonCodes : ['turnstile_rejected'])
        );
      }

      if (
        this.expectedHostname &&
        payload.hostname !== this.expectedHostname
      ) {
        return failure('turnstile', 'turnstile_hostname_mismatch');
      }

      if (
        expectedAction &&
        payload.action !== expectedAction
      ) {
        return failure('turnstile', 'turnstile_action_mismatch');
      }

      return {
        success: true,
        provider: 'turnstile',
        reasonCodes: []
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return failure('turnstile', 'turnstile_timeout');
      }

      return failure('turnstile', 'turnstile_unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createChallengeVerifier(
  options: ChallengeVerifierFactoryOptions
): ChallengeVerifier {
  if (options.provider !== 'turnstile' || !options.secretKey?.trim()) {
    return new NoopChallengeVerifier();
  }

  return new TurnstileChallengeVerifier({
    secretKey: options.secretKey.trim(),
    expectedHostname: options.expectedHostname,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl
  });
}
