const allowedLevels = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

export function resolveLogLevel(value: string | undefined): string {
  const candidate = value?.trim().toLowerCase() || 'info';
  return allowedLevels.has(candidate) ? candidate : 'info';
}

export function apiLoggerOptions(input: { nodeEnv?: string; logLevel?: string }) {
  if (input.nodeEnv === 'test') return false as const;
  return {
    level: resolveLogLevel(input.logLevel),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.set-cookie',
        'req.headers.x-api-key',
        'req.headers.x-suqnaa-human-check',
        'request.headers.authorization',
        'request.headers.cookie',
        'response.headers.set-cookie',
        '*.password',
        '*.token',
        '*.secret',
        '*.email',
        '*.phone',
        '*.address'
      ],
      censor: '[REDACTED]'
    }
  };
}
