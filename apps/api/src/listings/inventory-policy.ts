export type ListingAvailability =
  | 'in_stock'
  | 'limited'
  | 'out_of_stock'
  | 'service_available';

export interface NormalizedInventory {
  availabilityStatus: ListingAvailability;
  availableQuantity: number | null;
}

export class ListingInventoryPolicyError extends Error {}

export function normalizeListingInventory(input: {
  availabilityStatus: ListingAvailability;
  availableQuantity: number | null | undefined;
}): NormalizedInventory {
  if (input.availabilityStatus === 'service_available') {
    if (input.availableQuantity !== null && input.availableQuantity !== undefined) {
      throw new ListingInventoryPolicyError('Service listings cannot have a finite quantity');
    }
    return {
      availabilityStatus: 'service_available',
      availableQuantity: null
    };
  }

  const quantity = input.availableQuantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000000) {
    throw new ListingInventoryPolicyError('Listing quantity must be a whole number between 0 and 1000000');
  }
  if (quantity === 0) {
    if (input.availabilityStatus !== 'out_of_stock') {
      throw new ListingInventoryPolicyError('Zero quantity listings must be out of stock');
    }
    return { availabilityStatus: 'out_of_stock', availableQuantity: 0 };
  }
  if (input.availabilityStatus === 'out_of_stock') {
    throw new ListingInventoryPolicyError('Positive quantity listings cannot be out of stock');
  }

  return {
    availabilityStatus: input.availabilityStatus,
    availableQuantity: quantity
  };
}

export function canPublishInventory(input: {
  availabilityStatus: string;
  availableQuantity: number | null;
}): boolean {
  return input.availabilityStatus === 'service_available'
    || (input.availableQuantity !== null && input.availableQuantity > 0);
}
