const defaultRequestSizeBytes = 7 * 1024 * 1024;
const minimumRequestSizeBytes = 1024 * 1024;
const maximumRequestSizeBytes = 8 * 1024 * 1024;

export function resolveApiRequestSizeBytes(input: {
  value?: string;
}): number {
  const raw = input.value?.trim();

  if (!raw) {
    return defaultRequestSizeBytes;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error('API_REQUEST_SIZE_BYTES must be an integer');
  }

  if (parsed < minimumRequestSizeBytes) {
    throw new Error('API_REQUEST_SIZE_BYTES must be at least 1048576');
  }

  if (parsed > maximumRequestSizeBytes) {
    throw new Error('API_REQUEST_SIZE_BYTES must not exceed 8388608');
  }

  return parsed;
}
