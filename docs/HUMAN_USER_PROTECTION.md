# Human User Protection

Suqnaa needs layered controls that make it difficult for automated abuse to register accounts, scrape listings, spam sellers, flood offers, or attack high-value actions.

## Goals

- Distinguish normal human activity from automated abuse.
- Add friction only when risk is elevated.
- Keep account creation, listing creation, messaging, offers, identity checks, and sensitive account actions protected.
- Keep the design provider-neutral so CAPTCHA, turnstile, proof checks, or managed challenge providers can be swapped later.

## Core controls

### 1. Server-side rate limits

Apply rate limits on the API, not only in the client.

Recommended buckets:

- IP address
- account ID
- session ID
- endpoint group
- device/app channel

Initial protected groups:

- registration
- login
- refresh
- listing creation
- offer submission
- messaging
- account recovery
- profile or identity checks

### 2. Challenge adapter

Create a provider-neutral challenge verification service. The web and mobile apps should submit a short challenge response only when the API requests one.

The backend should verify the challenge server-side and return one of:

- allow
- require challenge
- slow down
- reject

No privileged action should trust a client-only challenge result.

### 3. Risk scoring

Use a small internal risk score before expensive fraud tooling is added.

Signals can include:

- excessive requests in a short window
- repeated failed login attempts
- account age
- repeated listing drafts with similar content
- rapid messaging or offer activity
- repeated use of the same network range
- suspicious user-agent or missing app metadata

Risk score should not permanently ban by itself. It should choose friction level.

### 4. Progressive friction

Use the least disruptive control first.

Suggested ladder:

1. allow
2. delay response slightly
3. require challenge
4. require verified account detail
5. temporarily block action
6. manual review for severe abuse

### 5. Audit logging

Security decisions should be logged with:

- action name
- account ID when available
- IP/network summary
- risk score
- decision
- reason codes
- timestamp

Do not log raw secrets, passwords, full payment details, or unnecessary sensitive content.

## First implementation milestone

1. Add API middleware for endpoint-group rate limits.
2. Add a challenge verification interface.
3. Add `requiresHumanCheck` response shape for protected actions.
4. Add web/mobile placeholder UI for challenge-required states.
5. Add audit events for allow, challenge, and reject decisions.

## Protected action policy

Every high-impact action should eventually call a common protection check before executing business logic.

Example policy:

```text
checkHumanProtection({
  action: 'listing.create',
  accountId,
  ip,
  sessionId,
  userAgent,
  challengeResponse
})
```

The action should continue only when the returned decision is `allow`.

## Privacy principles

- Prefer server-side rate limits and challenge checks before invasive tracking.
- Keep device or network signals coarse unless stronger controls are legally and operationally justified.
- Explain to users when extra verification is required.
- Avoid blocking legitimate users only because they use VPNs, shared networks, or privacy tools.
