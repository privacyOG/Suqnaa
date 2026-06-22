# Live web conversations

The bilingual web conversation flow uses the protected same-origin transport and the authenticated conversation API.

## Inbox

- `/{locale}/messages` requires an active account session.
- Expired access sessions are restored through the existing HttpOnly refresh-cookie flow.
- The inbox lists only conversations where the authenticated account is a participant.
- Each entry shows the counterpart, latest message, listing context, updated time, and unread count.
- Conversation pages use cursor pagination and preserve API rate-limit feedback.

## Thread history

- `/{locale}/messages/{conversationId}` validates the locale and UUID before rendering.
- The API independently verifies that the authenticated account is a buyer or seller participant and returns `404` for denied access.
- Messages are rendered chronologically even though API pages arrive newest-first.
- Loading older history preserves the reader's position; initial load and newly sent messages move to the newest entry.
- Opening a thread sends a protected read acknowledgement for unread messages from the counterpart.

## Sending messages

- The recipient is derived from the authenticated participant pair returned by the API, not from editable browser input.
- Listing context is preserved when the conversation belongs to a listing.
- Every message carries a browser-generated UUID idempotency key.
- Message bodies are trimmed and limited to 2,000 characters.
- When the challenge provider is enabled, sends use the server-published `messageCreate` action and reset the challenge after every attempt.
- Per-account, per-IP, and participant-pair rate limits remain enforced by the API.
- Browser code never reads or submits bearer tokens.

## Regression coverage

The web regression command verifies inbox and history cursor paths, read acknowledgements, protected message creation, challenge-header forwarding, idempotency IDs, same-origin credentials, and the absence of browser authorization headers.
