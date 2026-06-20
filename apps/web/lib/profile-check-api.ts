const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

type JsonInput = Record<string, unknown>;

export async function startProfileCheck(accessToken: string, input: JsonInput) {
  const response = await fetch(`${apiBaseUrl}/v1/market/identity-checks`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error('Unable to start profile check');
  }

  return response.json();
}
