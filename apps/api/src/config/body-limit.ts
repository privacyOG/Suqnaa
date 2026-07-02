const defaultBodyLimitBytes = 7 * 1024 * 1024;
const minimumBodyLimitBytes = 1024 * 1024;
const maximumBodyLimitBytes = 8 * 1024 * 1024;

export function resolveApiBodyLimitBytes(input: {
  value?: string;
}): number {
  const raw = input.value?.trim();

  if (!raw) {
    return defaultBodyLimitBytes;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error('API_BODY_LIMIT_BYTES must be an integer');
  }

  if (parsed < minimumBodyLimitBytes) {
    throw new Error('API_BODY_LIMIT_BYTES must be at least 1048576');
  }

  if (parsed > maximumBodyLimitBytes) {
    throw new Error('API_BODY_LIMIT_BYTES must not exceed 8388608');
  }

  return parsed;
}
