/// <reference types="node" />

export type Chain = "ETHEREUM" | "POLYGON" | "BSC" | "TRON" | "BITCOIN";
export type InvoiceStatus = "created" | "pending" | "confirming" | "paid" | "expired" | "failed";
export type FiatCurrency = "USD" | "EUR" | "GBP" | "INR" | "AUD" | "CAD" | "JPY";

export interface CreateInvoiceParams {
  /** Amount in `currency` — provide this OR fiat_amount, not both. */
  amount?: number;
  /** Fiat amount, converted to USDT once at creation. */
  fiat_amount?: number;
  /** Required when fiat_amount is set. */
  fiat_currency?: FiatCurrency;
  chain: Chain;
  /**
   * Defaults to "USDT". Use "BTC" only with `chain: "BITCOIN"` — there is
   * no USDT on Bitcoin, so a BITCOIN invoice is priced directly in BTC.
   */
  currency?: "USDT" | "BTC";
  /** 1–1440, default 15. */
  expires_in_minutes?: number;
  /** Your own reconciliation ID (≤255 chars). */
  order_id?: string;
  customer_email?: string;
  /** Checkout redirects here on payment, with invoice_id/status/order_id appended. */
  success_url?: string;
  /** Linked from checkout on expiry/failure, same params appended. */
  cancel_url?: string;
}

export interface Invoice {
  invoice_id: string;
  amount: number | string;
  currency: string;
  chain: Chain;
  address: string;
  status: InvoiceStatus;
  paid_amount?: string | null;
  expires_at: string;
  order_id: string | null;
  success_url?: string | null;
  cancel_url?: string | null;
  fiat_amount: number | string | null;
  fiat_currency: string | null;
  is_test: boolean;
}

export interface InvoiceCheckResult {
  invoice_id: string;
  status: InvoiceStatus;
  done: boolean;
  paid_amount: string | null;
  paid_at: string | null;
}

export interface SimulatePaymentResult {
  invoice_id: string;
  status: "paid";
  paid_amount: string;
  fee_amount: number;
  net_amount: number;
  paid_at: string;
}

export interface InvoicePaidEvent {
  event: "invoice.paid";
  invoice_id: string;
  amount: number | string;
  paid_amount: string;
  fee_amount: number | string;
  net_amount: number | string;
  currency: string;
  chain: Chain;
  paid_at: string;
  order_id: string | null;
  customer_email: string | null;
  is_test?: boolean;
}

export interface InvoiceExpiredEvent {
  event: "invoice.expired";
  invoice_id: string;
  amount: number | string;
  currency: string;
  chain: Chain;
  expired_at: string;
  order_id: string | null;
  customer_email: string | null;
  is_test: boolean;
}

/**
 * Lifecycle events. Each fires at most once per invoice, so they can be
 * treated as state transitions. None of them is a signal to fulfil an
 * order — only `invoice.paid` is.
 */
export interface InvoiceLifecycleEvent {
  event:
    | "invoice.created"
    | "invoice.confirming"
    | "invoice.underpaid"
    | "invoice.refunded";
  invoice_id: string;
  amount: number | string;
  currency: string;
  /** Set only on re-quoted invoices (USDT-priced, paid in BTC). */
  pay_amount: number | string | null;
  pay_currency: string | null;
  chain: Chain | null;
  status: InvoiceStatus;
  order_id: string | null;
  customer_email: string | null;
  is_test: boolean;
  /** invoice.created only. */
  expires_at?: string;
  /** invoice.created only — null until the customer picks a network. */
  address?: string | null;
  /** invoice.confirming and invoice.underpaid. */
  received_amount?: number;
  /** invoice.underpaid only. */
  required_amount?: number;
  /** invoice.underpaid only — required_amount minus received_amount. */
  shortfall?: number;
  /**
   * invoice.refunded only. The platform is non-custodial — a refund is
   * the merchant's own send, recorded; tx hash may be null if recorded
   * before sending.
   */
  refunded_amount?: number;
  refund_address?: string;
  refund_tx_hash?: string | null;
  refunded_at?: string;
}

export type WebhookEvent =
  | InvoicePaidEvent
  | InvoiceExpiredEvent
  | InvoiceLifecycleEvent;

export interface PaymentGatewayConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  checkoutBaseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export declare class PaymentGateway {
  constructor(config: PaymentGatewayConfig);
  readonly isTestMode: boolean;
  createInvoice(params: CreateInvoiceParams): Promise<Invoice>;
  getInvoice(invoiceId: string): Promise<Invoice>;
  checkInvoice(invoiceId: string): Promise<InvoiceCheckResult>;
  simulatePayment(invoiceId: string): Promise<SimulatePaymentResult>;
  checkoutUrl(invoiceId: string): string;
}

export declare class PaymentGatewayError extends Error {
  status: number;
  issues: Array<{ path?: (string | number)[]; message: string }>;
  body: unknown;
  retryAfterSeconds?: number;
  readonly isValidationError: boolean;
  readonly isAuthError: boolean;
  readonly isRateLimited: boolean;
  readonly isNotFound: boolean;
}

export declare class WebhookVerificationError extends Error {}

export declare function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
  secret: string
): boolean;

export declare function constructEvent(
  rawBody: string | Buffer,
  signature: string | undefined,
  secret: string
): WebhookEvent;

export declare function webhookMiddleware(
  secret: string,
  options?: { onError?: (req: unknown, res: unknown) => void }
): (req: any, res: any, next: (err?: Error) => void) => void;

export declare function checkoutUrl(invoiceId: string, options?: { baseUrl?: string }): string;

export declare const API_BASE_URL: string;
export declare const CHECKOUT_BASE_URL: string;
export declare const SIGNATURE_HEADER: string;

export default PaymentGateway;
