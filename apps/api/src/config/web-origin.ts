const localOriginHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

type WebOriginInput = {
  nodeEnv: string;
  webOrigin?: string;
};

export function resolveWebOrigin(input: WebOriginInput): string {
  const origin = input.webOrigin ?? 'http://localhost:3000';
  const url = new URL(origin);

  if (input.nodeEnv === 'production') {
    if (localOriginHosts.has(url.hostname)) {
      throw new Error('WEB_ORIGIN must not point to a local host in production');
    }

    if (url.protocol !== 'https:') {
      throw new Error('WEB_ORIGIN must use HTTPS in production');
    }
  }

  return url.origin;
}
