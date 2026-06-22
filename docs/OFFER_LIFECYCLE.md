# Offer and order lifecycle

The marketplace activity workflow provides seller review, buyer cancellation, and accepted-offer order creation through authenticated, challenge-bound routes.

## Buyer submission

- A buyer may have only one pending offer per listing.
- Offer amount and currency are validated against the active listing.
- Client offer UUIDs provide idempotency.
- Buyers cannot submit offers on their own listings.

## Seller decision

- Sellers read incoming offers through `/v1/market/offers/incoming`.
- Accept and reject actions are available only to the listing owner.
- Only pending offers can be changed.
- Accepting an offer runs in one database transaction:
  1. the active listing becomes `reserved`;
  2. the selected offer becomes `accepted`;
  3. every competing pending offer on that listing becomes `rejected`.
- A partial state cannot be committed.
- The database permits only one accepted offer per listing.

## Buyer cancellation

- Buyers read their submissions through `/v1/market/offers/mine`.
- Only the buyer who created the offer may cancel it.
- Cancellation is allowed only while the offer remains `pending`.
- Accepted, rejected, expired, and already completed lifecycle states are not rewritten.

## Order creation

- `/v1/market/orders` accepts only:
  - `offerId`;
  - a supported payment method;
  - a client order UUID.
- Buyer, seller, listing, amount, and currency are read from the accepted offer and listing records.
- The offer must belong to the authenticated buyer and have status `accepted`.
- The listing must be `reserved`.
- One accepted offer can create at most one transaction.
- Client order UUIDs provide idempotency.
- The resulting transaction begins with status `pending`; actual payment collection remains a separate provider integration.

## Human protection and limits

- Seller decisions and buyer cancellation use the published `offerManage` challenge action.
- Order creation uses the published `orderCreate` challenge action.
- Account and IP limits protect list and mutation routes.
- Security audit records include actor, target, decision, risk score, reasons, and relevant state metadata.

## Migration

`007_offer_orders.sql` adds:

- one accepted offer per listing;
- one transaction per accepted offer;
- client order idempotency;
- payment-method storage and validation;
- transaction listing/status indexing.

Before creating unique indexes, legacy duplicate accepted offers and duplicate offer-linked transactions are normalized conservatively.
