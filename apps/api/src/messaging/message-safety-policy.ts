import { createHash } from 'node:crypto';

export const messageSafetyPolicy = Object.freeze({
  maxBodyCharacters: 2000,
  maxHttpUrls: 3,
  attachments: Object.freeze({
    enabled: false,
    maxCount: 0,
    reason: 'Attachments remain disabled until the hardened media safety pipeline is available.'
  }),
  identicalPairWindowMinutes: 10,
  identicalPairMaximum: 3,
  identicalBroadcastWindowMinutes: 30,
  identicalBroadcastMaximumRecipients: 3,
  newCounterpartWindowMinutes: 60,
  newCounterpartMaximum: 12
});

const unsafeControlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const httpUrlPattern = /https?:\/\/[^\s]+/giu;

export class MessagePolicyError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export interface InspectedMessageBody {
  body: string;
  normalizedBody: string;
  fingerprint: string;
  httpUrlCount: number;
}

export function inspectMessageBody(input: string): InspectedMessageBody {
  const body = input.trim();
  if (!body || body.length > messageSafetyPolicy.maxBodyCharacters) {
    throw new MessagePolicyError(
      'message_body_invalid',
      400,
      `Message body must contain between 1 and ${messageSafetyPolicy.maxBodyCharacters} characters`
    );
  }

  if (unsafeControlCharacters.test(body)) {
    throw new MessagePolicyError(
      'message_control_characters',
      400,
      'Message body contains unsupported control characters'
    );
  }

  const httpUrlCount = body.match(httpUrlPattern)?.length ?? 0;
  if (httpUrlCount > messageSafetyPolicy.maxHttpUrls) {
    throw new MessagePolicyError(
      'message_link_limit',
      400,
      `Message body may contain at most ${messageSafetyPolicy.maxHttpUrls} web links`
    );
  }

  const normalizedBody = body
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US');
  const fingerprint = createHash('sha256').update(normalizedBody, 'utf8').digest('hex');

  return { body, normalizedBody, fingerprint, httpUrlCount };
}

export function assertMessageAttachmentsDisabled(input: unknown): void {
  if (input === undefined || input === null) return;
  if (!Array.isArray(input)) {
    throw new MessagePolicyError('message_attachments_invalid', 400, 'Attachments must be an array');
  }
  if (input.length > 0) {
    throw new MessagePolicyError(
      'message_attachments_disabled',
      400,
      messageSafetyPolicy.attachments.reason
    );
  }
}

export function publicMessagePolicy() {
  return {
    maxBodyCharacters: messageSafetyPolicy.maxBodyCharacters,
    maxHttpUrls: messageSafetyPolicy.maxHttpUrls,
    attachments: {
      enabled: messageSafetyPolicy.attachments.enabled,
      maxCount: messageSafetyPolicy.attachments.maxCount,
      reason: messageSafetyPolicy.attachments.reason
    }
  };
}
