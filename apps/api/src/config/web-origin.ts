const localOriginHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

type WebOriginInput = {
  nodeEnv: string;
  webOrigin?: string;
};

export function resolveWebOrigin(input: WebOriginInput): string {
  const configuredOrigin = input.webOrigin ?? 'http://localhost:3000';
  const origin = configuredOrigin.trim();
  const url = new URL(origin);

  if (input.nodeEnv === 'production') {
    if (localOriginHosts.has(url.hostname)) {
      throw new Error('WEB_ORIGIN must not point to a local host in production');
    }

    if (url.protocol !== 'https:') {
      throw new Error('WEB_ORIGIN must use HTTPS in production');
    }

    if (url.username || url.password) {
      throw new Error('WEB_ORIGIN must not contain credentials in production');
    }

    if (origin !== url.origin) {
      throw new Error('WEB_ORIGIN must be an exact origin without path, query, fragment, or trailing slash');
    }
  }

  return url.origin;
}
