import Stripe from 'stripe';
import { env } from '../config/env.js';

let _stripe: Stripe | null = null;

export function isStripeEnabled(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('Stripe is not configured — set STRIPE_SECRET_KEY');
    }
    _stripe = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}
