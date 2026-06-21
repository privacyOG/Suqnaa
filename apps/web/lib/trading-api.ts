import { postAuthed, type JsonBody } from './authed-api';

export function createTimedSale(
  input: JsonBody,
  challengeResponse?: string
): Promise<Record<string, unknown>> {
  return postAuthed(
    '/v1/market/timed-sale',
    input,
    challengeResponse
  );
}

export function submitOffer(
  input: JsonBody,
  challengeResponse?: string
): Promise<Record<string, unknown>> {
  return postAuthed(
    '/v1/market/offers',
    input,
    challengeResponse
  );
}

export function createOrder(
  input: JsonBody,
  challengeResponse?: string
): Promise<Record<string, unknown>> {
  return postAuthed(
    '/v1/market/orders',
    input,
    challengeResponse
  );
}

export function submitReview(
  input: JsonBody,
  challengeResponse?: string
): Promise<Record<string, unknown>> {
  return postAuthed(
    '/v1/market/reviews',
    input,
    challengeResponse
  );
}
