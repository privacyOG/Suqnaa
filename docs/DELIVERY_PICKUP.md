# Delivery, pickup, tracking, and order timeline

P0-25 adds fulfilment configuration and evidence without weakening the payment or privacy boundaries established earlier.

## Order pricing boundary

An order now snapshots:

- item subtotal;
- selected shipping charge, if any;
- final payable total.

The buyer must choose either pickup or a seller-defined shipping option before protected checkout can begin. Shipping changes are accepted only while the order is still pending and before any payment collection session exists. The database synchronizes an allowed total change into the order payment intent and rejects later price mutation.

Seller shipping options are fixed-rate marketplace options. Sellers can maintain up to eight options while the listing is draft or active. A reserved, sold, expired, or removed listing cannot have its shipping options rewritten for an existing order.

## Address privacy

Exact shipping and pickup addresses are stored only in `order_fulfilment_details`, which is exposed through participant-authenticated order routes.

- A buyer can read their own shipping address.
- A seller receives the buyer shipping address only after payment is no longer pending.
- A seller discloses the exact pickup location only after payment is confirmed.
- Public listing and catalogue endpoints do not expose order addresses.
- Security-audit metadata and order-timeline details intentionally contain only non-sensitive summaries, never street-address fields.

The public listing location continues to use the existing privacy-safe marketplace location policy and is separate from an exact order delivery address.

## Pickup proof

For pickup orders:

1. The seller first stores the exact pickup location after payment.
2. The seller marks the order ready for pickup through the existing fulfilment transition.
3. The buyer may generate a one-time pickup proof code.
4. Suqnaa returns the plaintext code to the buyer once and stores only its SHA-256 digest.
5. The seller enters the code at handover.
6. A successful comparison records pickup evidence and marks the fulfilment delivered.
7. The buyer still confirms receipt separately; pickup proof does not itself authorise payment release.

Pickup proof expires and verification attempts are bounded. Reissuing a proof revokes the previous active proof.

## Shipping and delivery evidence

Shipping orders snapshot the selected method, optional carrier, and rate. When the seller marks an order shipped, the existing fulfilment state records:

- carrier;
- tracking reference;
- optional HTTPS tracking link;
- shipment timestamp.

A seller can subsequently record delivery evidence with a note and optional HTTPS evidence link. This changes fulfilment from `shipped` to `delivered` and creates an evidence record.

Seller-submitted delivery evidence is an assertion from the seller. It is not represented as independent carrier verification. Provider/carrier integrations can be added later without changing this evidence distinction.

## Order timeline

Participant-authenticated order timelines record lifecycle events such as:

- order creation;
- delivery or pickup selection;
- verified payment;
- pickup location availability;
- ready for pickup;
- pickup proof issuance and verification;
- shipment;
- delivery evidence;
- buyer receipt confirmation.

Timeline payloads are deliberately privacy-minimised. Exact street addresses and pickup proof values are not written to timeline events.

## Payment and settlement separation

P0-25 does not alter P0-23 payment authorisation or P0-24 seller settlement policy.

- delivery selection can affect the payable amount only before payment collection begins;
- fulfilment evidence can advance fulfilment status;
- buyer receipt confirmation remains a separate action;
- payment release remains separately authorised;
- seller transfer and bank payout remain P0-24 settlement actions.

None of these states are represented as regulated escrow.
