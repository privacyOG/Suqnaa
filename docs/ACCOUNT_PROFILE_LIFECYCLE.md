# Account profile lifecycle

## Profile ownership and privacy

Every account has a `user_profiles` row. Migration `015_account_profile_lifecycle.sql` backfills existing accounts and installs an insert trigger so future accounts begin with a private marketplace profile.

The authenticated owner profile is available through `GET /v1/account/profile`. Owners can update their display name, bio, city, country code, descriptive business fields, and privacy controls through `POST /v1/account/profile`.

Public profile access uses `GET /v1/profiles/:userId`. A public response is available only when all of these conditions hold:

- the account is active;
- the owner explicitly selected `profileVisibility: public`;
- the requested field is permitted by its privacy flag.

Email addresses and phone numbers are never returned by the public profile endpoint. City, country, business details, and avatar visibility are independently controllable. Business profile fields are descriptive and do not represent seller identity or business verification.

## Avatar handling

Profile avatars use the existing private media-storage configuration. No additional storage credentials or service configuration are introduced.

Authenticated owners can upload JPEG, PNG, or WebP avatar bodies through `POST /v1/account/profile/avatar/upload`. The API validates both the declared content type and the file signature and rejects bodies larger than 2 MiB.

The current owner avatar is available through `GET /v1/account/profile/avatar`. Public avatar delivery uses `GET /v1/profiles/:userId/avatar` and is allowed only for an active, public profile with avatar visibility enabled.

Replacing or deleting an avatar removes the referenced storage object where possible. Account deletion requires the current avatar object to be removed before personal profile data is anonymised. Later media-lifecycle work remains responsible for detecting and cleaning orphaned objects from interrupted historical operations.

## Account data export

`GET /v1/account/export` returns a JSON snapshot for the authenticated account. The export includes:

- account and profile data;
- listings created by the account;
- offers made by the account;
- transactions where the account is buyer or seller;
- conversations in which the account participates;
- messages in those conversations; and
- reports submitted by the account.

The export excludes password hashes, authentication secrets, internal fraud/moderation signals, and private contact information belonging to other accounts. Export generation is rate limited and audited.

## Account closure

`POST /v1/account/closure` requires the current password and an explicit typed acknowledgement. `mode: close` requires `CLOSE`.

Closing an account:

- sets account status to closed;
- records the closure timestamp;
- makes the marketplace profile private and disables all public profile fields;
- removes the account's draft, active, and expired listings from the marketplace;
- cancels the account's pending buyer offers;
- revokes every active refresh session; and
- invalidates outstanding password-reset and contact-verification challenges.

Closing does not automatically reopen the account later. Marketplace and operations tooling may introduce a separately authorised recovery policy in a future scope.

## Personal-data deletion

`mode: delete` requires the current password and the exact acknowledgement `DELETE`.

Deletion performs the closure controls above and additionally:

- removes the current avatar object;
- clears profile bio, location, business fields, and avatar metadata;
- clears phone identity and contact-verification timestamps;
- clears the password hash;
- replaces the email address with a non-personal tombstone derived from the opaque account identifier;
- replaces the display name with `Deleted account`; and
- records deletion-request and anonymisation timestamps.

The opaque account identifier and marketplace records required for transaction, conversation, order, moderation, and audit integrity are retained. This prevents referential corruption and preserves operational evidence while removing reusable login/contact/profile identity.

Final jurisdiction-specific retention periods and legal erasure exceptions remain subject to the later legal-policy work. This implementation does not claim that every retained marketplace record can always be erased immediately.

## Client behavior

The web client provides native profile/business/privacy editing, avatar upload/removal, JSON export, closure, and deletion controls. Successful closure clears the protected browser session.

The mobile client provides native profile/business/privacy editing and password-confirmed closure/deletion. Browser-specific avatar selection and JSON download use an exact secure handoff to `/{locale}/account/profile`. The handoff contains no account identifier, credentials, profile values, or hidden query state. Successful closure clears secure mobile session state.
