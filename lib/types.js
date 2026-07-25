/**
 * JSDoc typedefs only — no runtime code. These mirror the gateway's API
 * shapes (see payment-gateway-backend/API.md) and power editor IntelliSense
 * for plain-JS consumers; TypeScript consumers get index.d.ts instead.
 */

/**
 * @typedef {"ETHEREUM"|"POLYGON"|"BSC"|"TRON"|"BITCOIN"} Chain
 */

/**
 * @typedef {"created"|"pending"|"confirming"|"paid"|"expired"|"failed"} InvoiceStatus
 */

/**
 * @typedef {"USD"|"EUR"|"GBP"|"INR"|"AUD"|"CAD"|"JPY"} FiatCurrency
 */

/**
 * @typedef {object} CreateInvoiceParams
 * @property {number} [amount] amount in `currency` — provide this OR fiat_amount, not both
 * @property {number} [fiat_amount] fiat amount, converted to USDT once at creation
 * @property {FiatCurrency} [fiat_currency] required when fiat_amount is set
 * @property {Chain} chain which chain the customer pays on
 * @property {"USDT"|"BTC"} [currency] defaults to "USDT". Use "BTC" only with chain: "BITCOIN" —
 *   there is no USDT on Bitcoin, so a BITCOIN invoice is priced directly in BTC, not re-quoted
 *   from a USDT amount (that re-quote only happens when `chain` is omitted and the customer
 *   picks the network on the hosted checkout page, which this SDK does not expose a method for)
 * @property {number} [expires_in_minutes] 1–1440, default 15
 * @property {string} [order_id] your own reconciliation ID (≤255 chars)
 * @property {string} [customer_email]
 * @property {string} [success_url] checkout redirects here on payment, with invoice_id/status/order_id appended
 * @property {string} [cancel_url] linked from checkout on expiry/failure, same params appended
 */

/**
 * @typedef {object} Invoice
 * @property {string} invoice_id
 * @property {number|string} amount
 * @property {string} currency
 * @property {Chain} chain
 * @property {string} address deposit address the customer pays to
 * @property {InvoiceStatus} status
 * @property {string|null} [paid_amount]
 * @property {string} expires_at
 * @property {string|null} order_id
 * @property {string|null} [success_url]
 * @property {string|null} [cancel_url]
 * @property {number|string|null} fiat_amount
 * @property {string|null} fiat_currency
 * @property {boolean} is_test
 */

/**
 * @typedef {object} InvoiceCheckResult
 * @property {string} invoice_id
 * @property {InvoiceStatus} status
 * @property {boolean} done true when status is "paid"
 * @property {string|null} paid_amount
 * @property {string|null} paid_at
 */

/**
 * @typedef {object} SimulatePaymentResult
 * @property {string} invoice_id
 * @property {"paid"} status
 * @property {string} paid_amount
 * @property {number} fee_amount
 * @property {number} net_amount
 * @property {string} paid_at
 */

/**
 * @typedef {object} InvoicePaidEvent
 * @property {"invoice.paid"} event
 * @property {string} invoice_id
 * @property {number|string} amount
 * @property {string} paid_amount
 * @property {number|string} fee_amount
 * @property {number|string} net_amount
 * @property {string} currency
 * @property {Chain} chain
 * @property {string} paid_at
 * @property {string|null} order_id
 * @property {string|null} customer_email
 * @property {boolean} [is_test] present (true) for simulated test-mode payments
 */

/**
 * @typedef {object} InvoiceExpiredEvent
 * @property {"invoice.expired"} event
 * @property {string} invoice_id
 * @property {number|string} amount
 * @property {string} currency
 * @property {Chain} chain
 * @property {string} expired_at
 * @property {string|null} order_id
 * @property {string|null} customer_email
 * @property {boolean} is_test
 */

/**
 * Lifecycle events, each fired at most once per invoice so they can be
 * treated as state transitions. None is a signal to fulfil an order —
 * only invoice.paid is.
 *
 * @typedef {object} InvoiceLifecycleEvent
 * @property {"invoice.created"|"invoice.confirming"|"invoice.underpaid"} event
 * @property {string} invoice_id
 * @property {number|string} amount
 * @property {string} currency
 * @property {number|string|null} pay_amount set only on re-quoted (USDT-priced, BTC-paid) invoices
 * @property {string|null} pay_currency
 * @property {Chain|null} chain
 * @property {InvoiceStatus} status
 * @property {string|null} order_id
 * @property {string|null} customer_email
 * @property {boolean} is_test
 * @property {string} [expires_at] invoice.created only
 * @property {string|null} [address] invoice.created only — null until a network is picked
 * @property {number} [received_amount] invoice.confirming and invoice.underpaid
 * @property {number} [required_amount] invoice.underpaid only
 * @property {number} [shortfall] invoice.underpaid only
 */

/**
 * @typedef {InvoicePaidEvent|InvoiceExpiredEvent|InvoiceLifecycleEvent} WebhookEvent
 */

export {};
