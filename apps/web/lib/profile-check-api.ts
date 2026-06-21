import { postAuthed, type JsonBody } from './authed-api';

export function startProfileCheck(
  input: JsonBody,
  challengeResponse?: string
): Promise<Record<string, unknown>> {
  return postAuthed(
    '/v1/market/identity-checks',
    input,
    challengeResponse
  );
}
