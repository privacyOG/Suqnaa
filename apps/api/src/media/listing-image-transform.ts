import { spawn } from 'node:child_process';
import type { SupportedListingImageMime } from './listing-media-upload.js';

const transformTimeoutMs = 15_000;
const publicMaximumDimension = 2048;
const thumbnailMaximumDimension = 512;

export type ListingImageDerivative = {
  buffer: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
  kind: 'public' | 'thumbnail';
};

export type ListingImageTransformResult = {
  publicImage: ListingImageDerivative;
  thumbnail: ListingImageDerivative;
};

export class ListingImageTransformError extends Error {
  constructor(readonly code: 'transform_unavailable' | 'transform_failed' | 'transform_timeout') {
    super(code);
  }
}

function orientedDimensions(
  width: number,
  height: number,
  orientation: number | null
): { width: number; height: number } {
  return orientation !== null && orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height };
}

function outputDimensions(width: number, height: number, maximum: number): { width: number; height: number } {
  if (width <= maximum && height <= maximum) return { width, height };
  const scale = Math.min(maximum / width, maximum / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function inputSpecifier(mimeType: SupportedListingImageMime): string {
  if (mimeType === 'image/jpeg') return 'jpeg:-';
  if (mimeType === 'image/png') return 'png:-';
  return 'webp:-';
}

function command(): string {
  return process.env.MEDIA_IMAGE_CONVERT_COMMAND?.trim() || 'convert';
}

async function convertToWebp(
  input: Buffer,
  maximum: number,
  mimeType: SupportedListingImageMime
): Promise<Buffer> {
  const args = [
    '-limit', 'memory', '128MiB',
    '-limit', 'map', '256MiB',
    '-limit', 'disk', '512MiB',
    inputSpecifier(mimeType),
    '-auto-orient',
    '-strip',
    '-resize', `${maximum}x${maximum}>`,
    '-quality', '82',
    'webp:-'
  ];

  return await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command(), args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, MAGICK_THREAD_LIMIT: '2' }
    });
    const output: Buffer[] = [];
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill('SIGKILL');
      reject(new ListingImageTransformError('transform_timeout'));
    }, transformTimeoutMs);

    child.stdout.on('data', (chunk: Buffer) => output.push(Buffer.from(chunk)));
    child.stderr.resume();
    child.on('error', () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(new ListingImageTransformError('transform_unavailable'));
    });
    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code !== 0 || output.length === 0) {
        reject(new ListingImageTransformError('transform_failed'));
        return;
      }
      resolve(Buffer.concat(output));
    });

    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
}

export async function transformListingImage(input: {
  buffer: Buffer;
  mimeType: SupportedListingImageMime;
  width: number;
  height: number;
  orientation: number | null;
}): Promise<ListingImageTransformResult> {
  const oriented = orientedDimensions(input.width, input.height, input.orientation);
  const [publicBuffer, thumbnailBuffer] = await Promise.all([
    convertToWebp(input.buffer, publicMaximumDimension, input.mimeType),
    convertToWebp(input.buffer, thumbnailMaximumDimension, input.mimeType)
  ]);
  const publicDimensions = outputDimensions(oriented.width, oriented.height, publicMaximumDimension);
  const thumbnailDimensions = outputDimensions(oriented.width, oriented.height, thumbnailMaximumDimension);

  return {
    publicImage: {
      buffer: publicBuffer,
      mimeType: 'image/webp',
      width: publicDimensions.width,
      height: publicDimensions.height,
      kind: 'public'
    },
    thumbnail: {
      buffer: thumbnailBuffer,
      mimeType: 'image/webp',
      width: thumbnailDimensions.width,
      height: thumbnailDimensions.height,
      kind: 'thumbnail'
    }
  };
}

export const listingImageTransformInternals = {
  orientedDimensions,
  outputDimensions,
  inputSpecifier,
  publicMaximumDimension,
  thumbnailMaximumDimension,
  transformTimeoutMs
};
