export type ApiErrorResponse = {
  statusCode: number;
  body: {
    error: string;
  };
};

export function resolveApiErrorResponse(error: unknown): ApiErrorResponse | null {
  const candidate = error as {
    code?: unknown;
    name?: unknown;
    statusCode?: unknown;
  };

  if (candidate.name === 'ZodError') {
    return {
      statusCode: 400,
      body: { error: 'Invalid request payload' }
    };
  }

  if (candidate.statusCode === 413 || candidate.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return {
      statusCode: 413,
      body: { error: 'Request is too large' }
    };
  }

  return null;
}
