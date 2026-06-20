const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

type JsonInput = Record<string, unknown>;

async function postJson(path: string, accessToken: string, input: JsonInput) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error('Unable to submit request');
  }

  return response.json();
}

export function createTimedSale(accessToken: string, input: JsonInput) {
  return postJson('/v1/market/timed-sale', accessToken, input);
}

export function submitOffer(accessToken: string, input: JsonInput) {
  return postJson('/v1/market/offers', accessToken, input);
}
