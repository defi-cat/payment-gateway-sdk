import { PaymentGatewayError } from "./errors.js";
import { checkoutUrl, CHECKOUT_BASE_URL } from "./checkout.js";

export const API_BASE_URL = "https://payment-gateway-backend-teal.vercel.app";

/**
 * @typedef {import("./types.js").CreateInvoiceParams} CreateInvoiceParams
 * @typedef {import("./types.js").Invoice} Invoice
 * @typedef {import("./types.js").InvoiceCheckResult} InvoiceCheckResult
 * @typedef {import("./types.js").SimulatePaymentResult} SimulatePaymentResult
 */

export class PaymentGateway {
  #apiKey;
  #apiSecret;
  #baseUrl;
  #checkoutBaseUrl;
  #timeoutMs;
  #fetch;

  /**
   * @param {object} config
   * @param {string} config.apiKey your pk_live_... or pk_test_... key
   * @param {string} config.apiSecret your sk_live_... or sk_test_... secret
   * @param {string} [config.baseUrl] gateway API base URL (defaults to production)
   * @param {string} [config.checkoutBaseUrl] hosted checkout base URL
   * @param {number} [config.timeoutMs] per-request timeout (default 30s)
   * @param {typeof fetch} [config.fetch] custom fetch implementation (for testing)
   */
  constructor({
    apiKey,
    apiSecret,
    baseUrl = API_BASE_URL,
    checkoutBaseUrl = CHECKOUT_BASE_URL,
    timeoutMs = 30_000,
    fetch = globalThis.fetch,
  } = {}) {
    if (typeof apiKey !== "string" || !apiKey.startsWith("pk_")) {
      throw new TypeError("apiKey is required and must start with pk_live_ or pk_test_");
    }
    if (typeof apiSecret !== "string" || !apiSecret.startsWith("sk_")) {
      throw new TypeError("apiSecret is required and must start with sk_live_ or sk_test_");
    }
    this.#apiKey = apiKey;
    this.#apiSecret = apiSecret;
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#checkoutBaseUrl = checkoutBaseUrl;
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetch;
  }

  /** True when constructed with a pk_test_ key — invoices will be sandbox invoices. */
  get isTestMode() {
    return this.#apiKey.startsWith("pk_test_");
  }

  /**
   * Create an invoice. Provide either `amount` (USDT) or
   * `fiat_amount` + `fiat_currency` — not both.
   *
   * @param {CreateInvoiceParams} params
   * @returns {Promise<Invoice>}
   */
  async createInvoice(params) {
    if (!params || typeof params !== "object") {
      throw new TypeError("createInvoice requires a params object");
    }
    const hasAmount = params.amount != null;
    const hasFiat = params.fiat_amount != null;
    if (hasAmount === hasFiat) {
      throw new TypeError("Provide either amount (USDT) or fiat_amount + fiat_currency, not both/neither");
    }
    if (!params.chain) {
      throw new TypeError(
        "chain is required (ETHEREUM, POLYGON, BSC, TRON, or BITCOIN)"
      );
    }

    return this.#request("POST", "/api/payments/invoice", {
      auth: true,
      body: { currency: "USDT", ...params },
    });
  }

  /**
   * Fetch an invoice's current state. No auth needed — the ID itself is
   * the capability. Also triggers the gateway's throttled on-chain check.
   *
   * @param {string} invoiceId
   * @returns {Promise<Invoice>}
   */
  async getInvoice(invoiceId) {
    this.#requireId(invoiceId);
    return this.#request("GET", `/api/payments/invoice/${encodeURIComponent(invoiceId)}`);
  }

  /**
   * Force an immediate, unthrottled on-chain check. Rate limited
   * (20 requests / 15 min per IP) — use after a customer claims to have
   * paid, not as a polling loop.
   *
   * @param {string} invoiceId
   * @returns {Promise<InvoiceCheckResult>}
   */
  async checkInvoice(invoiceId) {
    this.#requireId(invoiceId);
    return this.#request("POST", `/api/payments/invoice/${encodeURIComponent(invoiceId)}/check`);
  }

  /**
   * Test mode only: instantly mark a sandbox invoice as paid. Computes the
   * real fee split and fires your invoice.paid webhook through the real
   * delivery pipeline — no crypto involved. 400s on live invoices.
   *
   * @param {string} invoiceId
   * @returns {Promise<SimulatePaymentResult>}
   */
  async simulatePayment(invoiceId) {
    this.#requireId(invoiceId);
    return this.#request(
      "POST",
      `/api/payments/invoice/${encodeURIComponent(invoiceId)}/simulate-payment`,
      { auth: true }
    );
  }

  /**
   * The hosted checkout page URL for an invoice — send your customer here.
   *
   * @param {string} invoiceId
   * @returns {string}
   */
  checkoutUrl(invoiceId) {
    return checkoutUrl(invoiceId, { baseUrl: this.#checkoutBaseUrl });
  }

  #requireId(invoiceId) {
    if (!invoiceId || typeof invoiceId !== "string") {
      throw new TypeError("invoiceId is required");
    }
  }

  async #request(method, path, { body, auth = false } = {}) {
    const headers = { accept: "application/json" };
    if (auth) {
      headers["x-api-key"] = this.#apiKey;
      headers["x-api-secret"] = this.#apiSecret;
    }
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }

    let res;
    try {
      res = await this.#fetch(this.#baseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (cause) {
      throw new PaymentGatewayError(`Request to ${path} failed: ${cause.message}`, {
        status: 0,
        cause,
      });
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }
    }

    if (!res.ok) {
      throw PaymentGatewayError.fromResponse(res, data);
    }
    return data;
  }
}
