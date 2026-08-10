import net from 'node:net';
import type {
  ListingMediaReviewInput,
  ListingMediaReviewResult,
  ListingMediaReviewer
} from './listing-media-review.js';

const defaultHost = 'clamav';
const defaultPort = 3310;
const defaultTimeoutMs = 10_000;
const chunkSize = 64 * 1024;

export class ClamdMediaReviewError extends Error {}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new ClamdMediaReviewError(`${name} must be a positive integer`);
  }
  return parsed;
}

function resolveHost(value?: string): string {
  const configured = value?.trim() || process.env.CLAMAV_HOST?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new ClamdMediaReviewError('CLAMAV_HOST is required in production');
  }
  return defaultHost;
}

export function parseClamdResponse(response: string): ListingMediaReviewResult {
  const normalized = response.replace(/\0/g, '').trim();
  if (normalized.endsWith(': OK') || normalized === 'stream: OK') {
    return {
      verdict: 'clean',
      provider: 'clamav-clamd',
      reasonCodes: []
    };
  }
  const found = normalized.match(/:\s*(.+)\s+FOUND$/);
  if (found) {
    return {
      verdict: 'reject',
      provider: 'clamav-clamd',
      reference: found[1].slice(0, 200),
      reasonCodes: ['malware_detected']
    };
  }
  throw new ClamdMediaReviewError('ClamAV returned an unrecognized scan result');
}

export class ClamdListingMediaReviewer implements ListingMediaReviewer {
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;

  constructor(input: { host?: string; port?: number; timeoutMs?: number } = {}) {
    this.host = resolveHost(input.host);
    this.port = input.port ?? parsePositiveInteger(process.env.CLAMAV_PORT, defaultPort, 'CLAMAV_PORT');
    this.timeoutMs = input.timeoutMs ?? parsePositiveInteger(
      process.env.CLAMAV_TIMEOUT_MS,
      defaultTimeoutMs,
      'CLAMAV_TIMEOUT_MS'
    );
  }

  async review(input: ListingMediaReviewInput): Promise<ListingMediaReviewResult> {
    return await new Promise<ListingMediaReviewResult>((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const response: Buffer[] = [];
      let finished = false;

      const fail = (error: unknown) => {
        if (finished) return;
        finished = true;
        socket.destroy();
        reject(error instanceof Error ? error : new ClamdMediaReviewError('ClamAV scan failed'));
      };

      socket.setTimeout(this.timeoutMs, () => fail(new ClamdMediaReviewError('ClamAV scan timed out')));
      socket.on('error', fail);
      socket.on('data', (chunk) => response.push(Buffer.from(chunk)));
      socket.on('end', () => {
        if (finished) return;
        finished = true;
        try {
          resolve(parseClamdResponse(Buffer.concat(response).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
      socket.on('connect', () => {
        socket.write(Buffer.from('zINSTREAM\0', 'binary'));
        for (let offset = 0; offset < input.buffer.length; offset += chunkSize) {
          const chunk = input.buffer.subarray(offset, Math.min(offset + chunkSize, input.buffer.length));
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length, 0);
          socket.write(length);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
    });
  }
}
