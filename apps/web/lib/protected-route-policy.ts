export type ProtectedMethod = 'GET' | 'POST';

export interface ProtectedRoute {
  method: ProtectedMethod;
  path: string;
  query: string;
}

interface RouteRule {
  method: ProtectedMethod;
  pattern: RegExp;
  queryKeys: ReadonlySet<string>;
}

const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';

const rules: readonly RouteRule[] = [
  { method: 'GET', pattern: /^\/v1\/account\/me$/, queryKeys: new Set() },
  { method: 'GET', pattern: /^\/v1\/conversations$/, queryKeys: new Set(['limit', 'before']) },
  { method: 'GET', pattern: new RegExp(`^/v1/conversations/${uuid}/messages$`), queryKeys: new Set(['limit', 'before']) },
  { method: 'GET', pattern: /^\/v1\/listings\/mine$/, queryKeys: new Set(['status', 'limit', 'before']) },
  { method: 'POST', pattern: /^\/v1\/messages$/, queryKeys: new Set() },
  { method: 'POST', pattern: new RegExp(`^/v1/conversations/${uuid}/read$`), queryKeys: new Set() },
  { method: 'POST', pattern: /^\/v1\/listings$/, queryKeys: new Set() },
  { method: 'POST', pattern: new RegExp(`^/v1/listings/${uuid}/status$`), queryKeys: new Set() },
  { method: 'POST', pattern: new RegExp(`^/v1/listings/${uuid}/media$`), queryKeys: new Set() },
  { method: 'POST', pattern: /^\/v1\/market\/timed-sale$/, queryKeys: new Set() },
  { method: 'POST', pattern: /^\/v1\/market\/offers$/, queryKeys: new Set() },
  { method: 'POST', pattern: /^\/v1\/market\/orders$/, queryKeys: new Set() },
  { method: 'POST', pattern: /^\/v1\/market\/reviews$/, queryKeys: new Set() },
  { method: 'POST', pattern: /^\/v1\/market\/identity-checks$/, queryKeys: new Set() }
];

function safeSegment(segment: string): boolean {
  return segment.length > 0 &&
    segment.length <= 120 &&
    /^[A-Za-z0-9_-]+$/.test(segment);
}

export function resolveProtectedRoute(
  method: string,
  segments: readonly string[],
  searchParams: URLSearchParams
): ProtectedRoute | null {
  if (method !== 'GET' && method !== 'POST') {
    return null;
  }

  if (segments.length === 0 || segments.length > 8 || !segments.every(safeSegment)) {
    return null;
  }

  const path = `/${segments.join('/')}`;
  const rule = rules.find((candidate) =>
    candidate.method === method && candidate.pattern.test(path)
  );
  if (!rule) {
    return null;
  }

  const output = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    if (!rule.queryKeys.has(key) || value.length > 200 || output.has(key)) {
      return null;
    }
    output.set(key, value);
  }

  return {
    method,
    path,
    query: output.toString()
  };
}
