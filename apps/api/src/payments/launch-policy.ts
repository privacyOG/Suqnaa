export const initialLaunchCountries = ['AU'] as const;
export const initialLaunchCurrencies = ['AUD'] as const;
export const initialLaunchPaymentMethods = ['card', 'wallet'] as const;

export type InitialLaunchCountry = typeof initialLaunchCountries[number];
export type InitialLaunchCurrency = typeof initialLaunchCurrencies[number];
export type InitialLaunchPaymentMethod = typeof initialLaunchPaymentMethods[number];

export const initialLaunchPolicy = {
  market: 'australia',
  countries: initialLaunchCountries,
  currencies: initialLaunchCurrencies,
  paymentMethods: initialLaunchPaymentMethods,
  legalModel: 'marketplace_intermediary' as const,
  sellerIsSupplier: true,
  suqnaaIsMerchantOfRecord: false,
  suqnaaCustodiesCustomerFunds: false,
  storedValueWalletEnabled: false,
  bankTransferEnabled: false,
  virtualAssetPaymentsEnabled: false,
  providerHostedSellerOnboardingRequired: true,
  providerControlledFundsRequired: true,
  providerControlledPayoutsRequired: true,
  legalApprovalRequiredBeforeLivePayments: true
} as const;

export type LaunchPaymentEligibilityInput = {
  countryCode: string;
  currencyCode: string;
  paymentMethod: string;
};

export type LaunchPaymentEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reason: 'country_not_launched' | 'currency_not_launched' | 'payment_method_not_launched';
    };

export function evaluateInitialLaunchPayment(
  input: LaunchPaymentEligibilityInput
): LaunchPaymentEligibility {
  const countryCode = input.countryCode.trim().toUpperCase();
  const currencyCode = input.currencyCode.trim().toUpperCase();
  const paymentMethod = input.paymentMethod.trim().toLowerCase();

  if (!initialLaunchCountries.includes(countryCode as InitialLaunchCountry)) {
    return { eligible: false, reason: 'country_not_launched' };
  }

  if (!initialLaunchCurrencies.includes(currencyCode as InitialLaunchCurrency)) {
    return { eligible: false, reason: 'currency_not_launched' };
  }

  if (!initialLaunchPaymentMethods.includes(paymentMethod as InitialLaunchPaymentMethod)) {
    return { eligible: false, reason: 'payment_method_not_launched' };
  }

  return { eligible: true };
}
