export interface AssistantRequest {
  locale: 'en' | 'ar';
  purpose: 'listing_draft' | 'buyer_help' | 'safety_help';
  message: string;
}

export interface AssistantResponse {
  enabled: boolean;
  locale: 'en' | 'ar';
  purpose: string;
  answer: string;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export async function askAssistant(input: AssistantRequest): Promise<AssistantResponse> {
  const response = await fetch(`${apiBaseUrl}/v1/assistant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error('Unable to contact assistant');
  }

  const payload = await response.json() as { assistant: AssistantResponse };
  return payload.assistant;
}
