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

type MediaStorageDriver = 'local' | 's3';

export interface StoreMediaInput {
  objectKey: string;
  buffer: Buffer;
  mimeType: string;
  sha256?: string;
}

export interface StoredMediaObject {
  objectKey: string;
  sha256: string;
}

export type MediaDelivery =
  | {
      type: 'buffer';
      buffer: Buffer;
      mimeType: string;
      cacheControl: string;
    }
  | {
      type: 'redirect';
      url: string;
      cacheControl: string;
    };

export interface ListingMediaStorage {
  readonly driver: MediaStorageDriver;
  put(input: StoreMediaInput): Promise<StoredMediaObject>;
  deliver(objectKey: string, mimeType: string): Promise<MediaDelivery>;
  remove(objectKey: string): Promise<void>;
}

const defaultCacheControl = 'public, max-age=3600';
const localOriginHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const defaultLinkLifetimeSeconds = 900;
const maxProductionLinkLifetimeSeconds = 3600;

export function resolveMediaStorageDriver(input: {
  nodeEnv?: string;
  driver?: string;
}): MediaStorageDriver {
  const driver = (input.driver ?? 'local').trim().toLowerCase();

  if (driver !== 'local' && driver !== 's3') {
    throw new Error(`Unsupported MEDIA_STORAGE_DRIVER: ${driver}`);
  }

  if (input.nodeEnv === 'production' && driver !== 's3') {
    throw new Error('S3 media storage is required in production');
  }

  return driver;
}

export function resolveMediaPublicBaseUrl(input: {
  nodeEnv?: string;
  publicBaseUrl?: string;
}): string | null {
  const value = input.publicBaseUrl?.trim();

  if (!value) {
    return null;
  }

  const url = new URL(value);

  if (input.nodeEnv === 'production') {
    if (url.protocol !== 'https:') {
      throw new Error('MEDIA_PUBLIC_BASE_URL must use HTTPS in production');
    }

    if (localOriginHosts.has(url.hostname)) {
      throw new Error('MEDIA_PUBLIC_BASE_URL must not point to a local host in production');
    }
  }

  return trimTrailingSlash(url.origin + url.pathname);
}

export function resolveMediaLinkLifetimeSeconds(input: {
  nodeEnv?: string;
  value?: string;
}): number {
  const raw = input.value?.trim();

  if (!raw) {
    return defaultLinkLifetimeSeconds;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('MEDIA_SIGNED_URL_TTL_SECONDS must be a positive integer');
  }

  if (input.nodeEnv === 'production' && parsed > maxProductionLinkLifetimeSeconds) {
    throw new Error('MEDIA_SIGNED_URL_TTL_SECONDS must not exceed 3600 in production');
  }

  return parsed;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function encodeObjectKey(objectKey: string): string {
  return objectKey.split('/').map(encodeURIComponent).join('/');
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for S3 media storage`);
  }
  return value;
}

class LocalListingMediaStorage implements ListingMediaStorage {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(root = process.env.MEDIA_STORAGE_DIR ?? '.suqnaa-media') {
    this.root = path.resolve(root);
  }

  async put(input: StoreMediaInput): Promise<StoredMediaObject> {
    const filePath = this.objectKeyPath(input.objectKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.buffer, { flag: 'wx' });
    return {
      objectKey: input.objectKey,
      sha256: input.sha256 ?? createHash('sha256').update(input.buffer).digest('hex')
    };
  }

  async deliver(objectKey: string, mimeType: string): Promise<MediaDelivery> {
    const buffer = await readFile(this.objectKeyPath(objectKey));
    return {
      type: 'buffer',
      buffer,
      mimeType,
      cacheControl: defaultCacheControl
    };
  }

  async remove(objectKey: string): Promise<void> {
    await rm(this.objectKeyPath(objectKey), { force: true });
  }

  private objectKeyPath(objectKey: string): string {
    const resolved = path.resolve(this.root, objectKey);
    if (!resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new Error('Unsafe media object key');
    }
    return resolved;
  }
}

class S3ListingMediaStorage implements ListingMediaStorage {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string | null;
  private readonly signedUrlTtlSeconds: number;

  constructor() {
    this.bucket = requiredEnv('S3_BUCKET');
    this.publicBaseUrl = resolveMediaPublicBaseUrl({
      nodeEnv: process.env.NODE_ENV,
      publicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL
    });
    this.signedUrlTtlSeconds = resolveMediaLinkLifetimeSeconds({
      nodeEnv: process.env.NODE_ENV,
      value: process.env.MEDIA_SIGNED_URL_TTL_SECONDS
    });

    const endpoint = process.env.S3_ENDPOINT?.trim();
    const region = process.env.S3_REGION?.trim() || 'auto';
    const accessKeyId = requiredEnv('S3_ACCESS_KEY');
    const secretAccessKey = requiredEnv('S3_SECRET_KEY');

    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });
  }

  async put(input: StoreMediaInput): Promise<StoredMediaObject> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      Body: input.buffer,
      ContentType: input.mimeType,
      CacheControl: defaultCacheControl,
      Metadata: {
        sha256: input.sha256 ?? createHash('sha256').update(input.buffer).digest('hex')
      }
    }));

    return {
      objectKey: input.objectKey,
      sha256: input.sha256 ?? createHash('sha256').update(input.buffer).digest('hex')
    };
  }

  async deliver(objectKey: string): Promise<MediaDelivery> {
    if (this.publicBaseUrl) {
      return {
        type: 'redirect',
        url: `${this.publicBaseUrl}/${encodeObjectKey(objectKey)}`,
        cacheControl: defaultCacheControl
      };
    }

    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey
      }),
      { expiresIn: this.signedUrlTtlSeconds }
    );

    return {
      type: 'redirect',
      url,
      cacheControl: 'private, max-age=60'
    };
  }

  async remove(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: objectKey
    }));
  }
}

let cachedStorage: ListingMediaStorage | null = null;

export function getListingMediaStorage(): ListingMediaStorage {
  if (cachedStorage) {
    return cachedStorage;
  }

  const driver = resolveMediaStorageDriver({
    nodeEnv: process.env.NODE_ENV,
    driver: process.env.MEDIA_STORAGE_DRIVER
  });

  if (driver === 's3') {
    cachedStorage = new S3ListingMediaStorage();
    return cachedStorage;
  }

  cachedStorage = new LocalListingMediaStorage();
  return cachedStorage;
}
