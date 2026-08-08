import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type EvidenceStorageDriver = 'local' | 's3';

export const supportedDisputeEvidenceMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
] as const;
export type DisputeEvidenceMimeType = typeof supportedDisputeEvidenceMimeTypes[number];
export const maximumDisputeEvidenceBytes = 10 * 1024 * 1024;
export const maximumDisputeEvidenceItems = 12;

export interface StoredDisputeEvidence {
  objectKey: string;
  sha256: string;
}

export type DisputeEvidenceDelivery =
  | { type: 'buffer'; buffer: Buffer; mimeType: string }
  | { type: 'redirect'; url: string };

export interface DisputeEvidenceStorage {
  readonly driver: EvidenceStorageDriver;
  put(input: {
    objectKey: string;
    buffer: Buffer;
    mimeType: DisputeEvidenceMimeType;
  }): Promise<StoredDisputeEvidence>;
  deliver(objectKey: string, mimeType: string): Promise<DisputeEvidenceDelivery>;
  remove(objectKey: string): Promise<void>;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for S3 dispute evidence storage`);
  return value;
}

function localPath(root: string, objectKey: string): string {
  const resolved = path.resolve(root, objectKey);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe dispute evidence object key');
  return resolved;
}

class LocalDisputeEvidenceStorage implements DisputeEvidenceStorage {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(root = process.env.DISPUTE_EVIDENCE_STORAGE_DIR ?? '.suqnaa-dispute-evidence') {
    this.root = path.resolve(root);
  }

  async put(input: { objectKey: string; buffer: Buffer; mimeType: DisputeEvidenceMimeType }) {
    const target = localPath(this.root, input.objectKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, input.buffer, { flag: 'wx' });
    return {
      objectKey: input.objectKey,
      sha256: createHash('sha256').update(input.buffer).digest('hex')
    };
  }

  async deliver(objectKey: string, mimeType: string): Promise<DisputeEvidenceDelivery> {
    return {
      type: 'buffer',
      buffer: await readFile(localPath(this.root, objectKey)),
      mimeType
    };
  }

  async remove(objectKey: string): Promise<void> {
    await rm(localPath(this.root, objectKey), { force: true });
  }
}

class S3DisputeEvidenceStorage implements DisputeEvidenceStorage {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = requiredEnv('S3_BUCKET');
    const endpoint = process.env.S3_ENDPOINT?.trim();
    const region = process.env.S3_REGION?.trim() || 'auto';
    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: {
        accessKeyId: requiredEnv('S3_ACCESS_KEY'),
        secretAccessKey: requiredEnv('S3_SECRET_KEY')
      }
    });
  }

  async put(input: { objectKey: string; buffer: Buffer; mimeType: DisputeEvidenceMimeType }) {
    const sha256 = createHash('sha256').update(input.buffer).digest('hex');
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      Body: input.buffer,
      ContentType: input.mimeType,
      CacheControl: 'private, no-store',
      Metadata: { sha256 }
    }));
    return { objectKey: input.objectKey, sha256 };
  }

  async deliver(objectKey: string): Promise<DisputeEvidenceDelivery> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: 300 }
    );
    return { type: 'redirect', url };
  }

  async remove(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }
}

export function detectDisputeEvidenceMime(buffer: Buffer): DisputeEvidenceMimeType | null {
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  return null;
}

export function normalizeDisputeEvidenceMime(value: string | string[] | undefined): DisputeEvidenceMimeType | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = raw?.split(';', 1)[0]?.trim().toLowerCase();
  return supportedDisputeEvidenceMimeTypes.includes(normalized as DisputeEvidenceMimeType)
    ? normalized as DisputeEvidenceMimeType
    : null;
}

export function extensionForDisputeEvidence(mimeType: DisputeEvidenceMimeType): string {
  switch (mimeType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'application/pdf': return 'pdf';
  }
}

export function resolveDisputeEvidenceStorageDriver(input: {
  nodeEnv?: string;
  driver?: string;
}): EvidenceStorageDriver {
  const driver = (input.driver ?? 'local').trim().toLowerCase();
  if (driver !== 'local' && driver !== 's3') {
    throw new Error(`Unsupported dispute evidence storage driver: ${driver}`);
  }
  if (input.nodeEnv === 'production' && driver !== 's3') {
    throw new Error('S3 dispute evidence storage is required in production');
  }
  return driver;
}

let cached: DisputeEvidenceStorage | null = null;

export function getDisputeEvidenceStorage(): DisputeEvidenceStorage {
  if (cached) return cached;
  const driver = resolveDisputeEvidenceStorageDriver({
    nodeEnv: process.env.NODE_ENV,
    driver: process.env.MEDIA_STORAGE_DRIVER
  });
  cached = driver === 's3' ? new S3DisputeEvidenceStorage() : new LocalDisputeEvidenceStorage();
  return cached;
}
