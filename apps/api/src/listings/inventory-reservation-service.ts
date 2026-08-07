import { reservationExpiryFrom } from '../config/listing-lifecycle-config.js';

export class InventoryReservationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function finiteQuantity(value: unknown): number {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new InventoryReservationError('invalid_inventory', 'Listing inventory is invalid');
  }
  return quantity;
}

export async function reserveInventoryForOffer(input: {
  transaction: any;
  listingId: string;
  offerId: string;
  now: Date;
  reservationMinutes: number;
}) {
  const listing = await input.transaction.selectFrom('listings')
    .select([
      'id',
      'seller_id',
      'status',
      'availability_status',
      'available_quantity',
      'expires_at'
    ])
    .where('id', '=', input.listingId)
    .forUpdate()
    .executeTakeFirst();

  if (!listing || listing.status !== 'active') {
    throw new InventoryReservationError('listing_unavailable', 'Listing is no longer available');
  }

  const existing = await input.transaction.selectFrom('listing_inventory_reservations')
    .selectAll()
    .where('offer_id', '=', input.offerId)
    .executeTakeFirst();
  if (existing) {
    return { listing, reservation: existing, unchanged: true };
  }

  const previousAvailability = String(listing.availability_status ?? 'in_stock');
  const service = previousAvailability === 'service_available';
  let quantity = 0;
  let nextQuantity: number | null = null;
  let nextAvailability = previousAvailability;
  let nextStatus = String(listing.status);

  if (!service) {
    const available = finiteQuantity(listing.available_quantity);
    if (available <= 0 || previousAvailability === 'out_of_stock') {
      throw new InventoryReservationError('listing_out_of_stock', 'Listing is out of stock');
    }
    quantity = 1;
    nextQuantity = available - 1;
    if (nextQuantity === 0) {
      nextAvailability = 'out_of_stock';
      nextStatus = 'reserved';
    }
  }

  const updatedListing = service
    ? listing
    : await input.transaction.updateTable('listings')
        .set({
          available_quantity: nextQuantity,
          availability_status: nextAvailability,
          status: nextStatus,
          updated_at: input.now
        })
        .where('id', '=', listing.id)
        .where('status', '=', 'active')
        .where('available_quantity', '=', listing.available_quantity)
        .returning([
          'id',
          'seller_id',
          'status',
          'availability_status',
          'available_quantity',
          'expires_at'
        ])
        .executeTakeFirst();

  if (!updatedListing) {
    throw new InventoryReservationError('inventory_conflict', 'Listing inventory changed; refresh and try again');
  }

  const reservation = await input.transaction.insertInto('listing_inventory_reservations')
    .values({
      listing_id: listing.id,
      offer_id: input.offerId,
      order_id: null,
      quantity,
      previous_availability_status: service ? 'service_available' : previousAvailability,
      status: 'reserved',
      expires_at: reservationExpiryFrom(input.now, input.reservationMinutes),
      created_at: input.now,
      updated_at: input.now
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return {
    listing: updatedListing,
    reservation,
    unchanged: false
  };
}

export async function attachReservationToOrder(input: {
  transaction: any;
  offerId: string;
  orderId: string;
  now: Date;
}) {
  const reservation = await input.transaction.updateTable('listing_inventory_reservations')
    .set({
      order_id: input.orderId,
      expires_at: null,
      updated_at: input.now
    })
    .where('offer_id', '=', input.offerId)
    .where('status', '=', 'reserved')
    .where('order_id', 'is', null)
    .returningAll()
    .executeTakeFirst();

  if (reservation) {
    return reservation;
  }

  const existing = await input.transaction.selectFrom('listing_inventory_reservations')
    .selectAll()
    .where('offer_id', '=', input.offerId)
    .executeTakeFirst();
  if (existing?.order_id === input.orderId && existing.status === 'reserved') {
    return existing;
  }

  throw new InventoryReservationError(
    'reservation_unavailable',
    'Accepted offer inventory reservation is no longer available'
  );
}

export async function releaseInventoryReservation(input: {
  transaction: any;
  offerId: string;
  reason: string;
  now: Date;
}) {
  const reservation = await input.transaction.selectFrom('listing_inventory_reservations')
    .selectAll()
    .where('offer_id', '=', input.offerId)
    .forUpdate()
    .executeTakeFirst();

  if (!reservation) {
    throw new InventoryReservationError('reservation_missing', 'Inventory reservation not found');
  }
  if (reservation.status === 'released') {
    return { reservation, unchanged: true };
  }

  const listing = await input.transaction.selectFrom('listings')
    .select([
      'id',
      'status',
      'availability_status',
      'available_quantity',
      'expires_at'
    ])
    .where('id', '=', reservation.listing_id)
    .forUpdate()
    .executeTakeFirst();

  if (!listing) {
    throw new InventoryReservationError('listing_missing', 'Reservation listing not found');
  }

  if (Number(reservation.quantity) === 1) {
    const currentQuantity = finiteQuantity(listing.available_quantity);
    const restoredQuantity = currentQuantity + 1;
    const dueExpiry = listing.expires_at
      ? new Date(listing.expires_at).getTime() <= input.now.getTime()
      : false;
    const immutableStatus = listing.status === 'sold' || listing.status === 'removed';
    const nextStatus = immutableStatus
      ? listing.status
      : dueExpiry || listing.status === 'expired'
        ? 'expired'
        : 'active';
    const currentAvailability = String(listing.availability_status);
    const nextAvailability = currentAvailability === 'out_of_stock'
      ? String(reservation.previous_availability_status)
      : currentAvailability;

    await input.transaction.updateTable('listings')
      .set({
        available_quantity: restoredQuantity,
        availability_status: nextAvailability,
        status: nextStatus,
        updated_at: input.now
      })
      .where('id', '=', listing.id)
      .execute();
  }

  const released = await input.transaction.updateTable('listing_inventory_reservations')
    .set({
      status: 'released',
      released_at: input.now,
      release_reason: input.reason,
      expires_at: null,
      updated_at: input.now
    })
    .where('id', '=', reservation.id)
    .where('status', '=', 'reserved')
    .returningAll()
    .executeTakeFirst();

  if (!released) {
    throw new InventoryReservationError('reservation_conflict', 'Inventory reservation changed; retry the operation');
  }

  return { reservation: released, unchanged: false };
}
