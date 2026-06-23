import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION === 'auto' ? 'us-east-1' : env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY
  },
  forcePathStyle: true
});

export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_MEDIA_PER_LISTING = 10;
const DELIVERY_EXPIRY_SECONDS = 3600;

const mimeToExt: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

export function listingMediaKey(listingId: string, mimeType: string): string {
  const ext = mimeToExt[mimeType] ?? 'bin';
  return `listings/${listingId}/${randomUUID()}.${ext}`;
}

export function isAllowedImageType(mimeType: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(mimeType);
}

export async function uploadBuffer(
  objectKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: objectKey,
    Body: buffer,
    ContentType: mimeType,
    ContentLength: buffer.byteLength
  }));
}

export async function getDeliveryUrl(objectKey: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey }),
    { expiresIn: DELIVERY_EXPIRY_SECONDS }
  );
}

export async function deleteObject(objectKey: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: objectKey
  }));
}

export async function ensureBucket(webOrigin: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
  }

  await s3.send(new PutBucketCorsCommand({
    Bucket: env.S3_BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [webOrigin],
          AllowedMethods: ['GET', 'PUT'],
          AllowedHeaders: ['*'],
          MaxAgeSeconds: 600
        }
      ]
    }
  }));
}
