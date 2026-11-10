import { isPaymentProviderId } from "./providers";

/**
 * Returns true when the given path segment refers to a real payment gateway.
 * The `manual` provider is intentionally excluded: manual payments never go
 * through a public callback and are approved from the admin dashboard instead.
 */
export function assertPaymentProvider(provider: string): boolean {
  return isPaymentProviderId(provider);
}
