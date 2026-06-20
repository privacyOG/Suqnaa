const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export interface RegisterInput {
  email?: string;
  phone?: string;
  displayName: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function register(input: RegisterInput) {
  const response = await fetch(`${apiBaseUrl}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error('Unable to register');
  }

  return response.json();
}

export async function login(input: LoginInput) {
  const response = await fetch(`${apiBaseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error('Unable to login');
  }

  return response.json();
}

export async function currentAccount(accessToken: string) {
  const response = await fetch(`${apiBaseUrl}/v1/account/me`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Unable to load current account');
  }

  return response.json();
}
