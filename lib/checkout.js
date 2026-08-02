/**
 * Default hosted-checkout host. Overridable via
 * PAYMENT_GATEWAY_CHECKOUT_URL for operators running their own deployment
 * (see API_BASE_URL in client.js); an explicit `baseUrl` still wins.
 */
export const CHECKOUT_BASE_URL =
  (typeof process !== "undefined" &&
    process.env?.PAYMENT_GATEWAY_CHECKOUT_URL) ||
  "https://payment-checkout-ui.vercel.app";

/**
 * Returns the hosted checkout page URL for an invoice. Send your customer
 * here after creating an invoice — the page handles QR/address display,
 * live status polling, partial/overpayment states, and the
 * success_url/cancel_url redirect for you.
 *
 * @param {string} invoiceId
 * @param {{ baseUrl?: string }} [options]
 * @returns {string}
 */
export function checkoutUrl(invoiceId, { baseUrl = CHECKOUT_BASE_URL } = {}) {
  if (!invoiceId || typeof invoiceId !== "string") {
    throw new TypeError("invoiceId is required");
  }
  return `${baseUrl.replace(/\/+$/, "")}/checkout/${encodeURIComponent(invoiceId)}`;
}
