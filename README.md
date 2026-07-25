# @defi-cat/payment-gateway-sdk

Official Node.js SDK for the defi-cat crypto payment gateway. Create USDT
invoices on **Ethereum, Polygon, BSC, or TRON** — or native **Bitcoin**
invoices — redirect customers to the hosted checkout, and verify payment
webhooks — with the sharp edges (raw-body signature verification,
timing-safe compare, idempotent retries) handled for you.

- **Zero runtime dependencies** — uses native `fetch` (Node ≥ 18)
- ESM package with full editor IntelliSense (JSDoc + bundled `index.d.ts`)
- Test mode: build and verify your whole integration with zero real crypto

## Install

```bash
npm install github:defi-cat/payment-gateway-sdk
# (or, once published) npm install @defi-cat/payment-gateway-sdk
```

Using CommonJS? The package is ESM-only; load it with a dynamic import:

```js
const { PaymentGateway } = await import("@defi-cat/payment-gateway-sdk");
```

## Quickstart

```js
import { PaymentGateway } from "@defi-cat/payment-gateway-sdk";

const gw = new PaymentGateway({
  apiKey: process.env.PG_API_KEY,       // pk_live_... or pk_test_...
  apiSecret: process.env.PG_API_SECRET, // sk_live_... or sk_test_...
});

const invoice = await gw.createInvoice({
  amount: 25,                 // USDT — or fiat_amount + fiat_currency
  chain: "POLYGON",           // ETHEREUM | POLYGON | BSC | TRON | BITCOIN
  order_id: "order-1042",     // your reconciliation ID, echoed everywhere
  success_url: "https://yourstore.com/thanks",
  cancel_url: "https://yourstore.com/cart",
});

// Send the customer to the hosted checkout page:
res.redirect(gw.checkoutUrl(invoice.invoice_id));
```

The hosted checkout handles QR/address display, live status polling,
partial/overpayment states, and the success/cancel redirect. When it
redirects, it appends `invoice_id`, `status`, and `order_id` query params to
your URLs (preserving any query string you already had) — read them for UX,
but treat the **webhook** as the source of truth for payment.

Get API keys from the merchant dashboard → **API Keys**. Choose **Test**
mode there to get `pk_test_` keys for development (see [Test mode](#test-mode)).

## Webhooks

Register your endpoint URL in the dashboard → **Webhooks**; you'll be shown
a `whsec_...` secret once. Two events exist today:

| Event | When | Notable fields |
|---|---|---|
| `invoice.paid` | payment confirmed on-chain (or simulated in test mode) | `paid_amount`, `fee_amount`, `net_amount`, `paid_at`, `order_id` |
| `invoice.expired` | the expiry window passed without full payment | `expired_at`, `order_id` |
| `invoice.created` | an invoice was issued — including by a payment link, which your server never asked for | `expires_at`, `address`, `order_id` |
| `invoice.confirming` | the full amount is on-chain but not yet final | `received_amount` |
| `invoice.underpaid` | money arrived, but less than required | `received_amount`, `required_amount`, `shortfall` |

> **Only `invoice.paid` means fulfil.** `confirming` and `underpaid` are
> customer-communication signals — acting on them ships goods for money
> that hasn't (or won't) fully arrive.

The last three fire **at most once per invoice**, so you can treat them as
state transitions rather than polling results.

Failed deliveries are retried with backoff (1m → 5m → 30m → 2h → 12h), so
**your handler must be idempotent** — `invoice_id` is a safe dedupe key.
Every attempt, including failures, is visible in the dashboard's
**Webhooks → Delivery log**, where you can inspect the exact payload we
sent and resend it.

### Express

```js
import express from "express";
import { webhookMiddleware } from "@defi-cat/payment-gateway-sdk";

const app = express();

// Mount the webhook route BEFORE app.use(express.json()) — the middleware
// must read the raw body to verify the signature.
app.post(
  "/webhooks/payment-gateway",
  webhookMiddleware(process.env.PG_WEBHOOK_SECRET),
  (req, res) => {
    res.sendStatus(200); // respond fast (5s timeout), then act
    const event = req.webhookEvent;
    if (event.event === "invoice.paid") fulfillOrder(event.order_id, event);
  }
);

app.use(express.json()); // the rest of your app
```

### Any other framework

```js
import { constructEvent, verifyWebhookSignature } from "@defi-cat/payment-gateway-sdk";

// rawBody must be the request body EXACTLY as received (string or Buffer).
const event = constructEvent(rawBody, req.headers["x-paygateway-signature"], secret);
// throws WebhookVerificationError on a bad signature

// or the boolean form:
if (!verifyWebhookSignature(rawBody, signature, secret)) return respond400();
```

> ⚠️ **Always verify against the raw request body.** Never `JSON.parse` the
> body and re-`JSON.stringify` it for verification — a different serializer
> can reorder keys or change whitespace, and the signature is an HMAC-SHA256
> over the exact bytes the gateway sent (header: `X-PayGateway-Signature`).

## Test mode

Create a **Test** API key in the dashboard (`pk_test_...`). Invoices made
with it are sandbox invoices: they never touch a real chain, never count in
revenue reporting, and can be paid on demand:

```js
const gw = new PaymentGateway({ apiKey: "pk_test_...", apiSecret: "sk_test_..." });
console.log(gw.isTestMode); // true

const invoice = await gw.createInvoice({ amount: 5, chain: "POLYGON" });
await gw.simulatePayment(invoice.invoice_id);
// → invoice is now "paid"; your invoice.paid webhook fires for real,
//   through the same signed/retried pipeline as production.
```

See [`examples/express-store`](examples/express-store) for a complete
runnable store using this flow.

## API

### `new PaymentGateway(config)`

| Option | Default | |
|---|---|---|
| `apiKey` | — | required, `pk_live_`/`pk_test_` |
| `apiSecret` | — | required, `sk_live_`/`sk_test_` |
| `baseUrl` | production gateway URL | point at `http://localhost:5000` for a local backend |
| `checkoutBaseUrl` | hosted checkout URL | |
| `timeoutMs` | `30000` | per-request timeout |
| `fetch` | `globalThis.fetch` | injectable for testing |

### Methods

- **`createInvoice(params)`** → `Invoice`. Provide `amount` (in `currency`,
  default `USDT`) **or** `fiat_amount` + `fiat_currency`
  (`USD EUR GBP INR AUD CAD JPY` — quoted to USDT once at creation). Other
  params: `chain` (required — `ETHEREUM | POLYGON | BSC | TRON | BITCOIN`),
  `expires_in_minutes` (1–1440, default 15), `order_id`, `customer_email`,
  `success_url`, `cancel_url`.

  There is no USDT on Bitcoin — for a native BTC invoice, pass
  `chain: "BITCOIN"` with `currency: "BTC"` and `amount` in BTC directly:
  ```js
  await gw.createInvoice({ amount: 0.0005, currency: "BTC", chain: "BITCOIN" });
  ```
  (The USDT→BTC re-quote you may see on the hosted checkout only applies
  when a merchant omits `chain` entirely and lets the customer pick the
  network there — a flow this SDK doesn't expose a method for yet.)
- **`getInvoice(invoiceId)`** → `Invoice` with current `status`
  (`created | pending | confirming | paid | expired | failed`) and
  `paid_amount`. No auth required by the API.
- **`checkInvoice(invoiceId)`** → `{ status, done, paid_amount, paid_at }`.
  Forces an immediate on-chain check — rate limited (20/15min per IP), use
  after a customer says "I paid", not as a polling loop.
- **`simulatePayment(invoiceId)`** — test mode only; 400s on live invoices.
- **`checkoutUrl(invoiceId)`** → hosted checkout URL string.

### Errors

Every failed request throws `PaymentGatewayError`:

```js
import { PaymentGatewayError } from "@defi-cat/payment-gateway-sdk";

try {
  await gw.createInvoice({ amount: -1, chain: "DOGE" });
} catch (err) {
  if (err instanceof PaymentGatewayError) {
    err.status;             // HTTP status (0 = network/timeout)
    err.isValidationError;  // 400 with field-level details in err.issues
    err.isAuthError;        // 401 — bad/revoked credentials
    err.isRateLimited;      // 429 — err.retryAfterSeconds may be set
    err.isNotFound;         // 404
  }
}
```

## Fees & settlement

The platform fee (1% by default) is deducted from each payment;
`fee_amount + net_amount = paid_amount`, reported in the `invoice.paid`
webhook. Net proceeds are periodically swept to the payout address you set
in the dashboard — settlement is not instant on confirmation.

## License

MIT
