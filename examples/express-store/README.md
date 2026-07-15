# Example: Express store

A ~120-line store demonstrating the full payment lifecycle in **test mode** —
create invoice → redirect to hosted checkout → receive + verify the webhook →
fulfill the order. No real crypto moves at any point.

## Run it

1. Run the gateway backend locally (`payment-gateway-backend`: `npm start`,
   listens on `localhost:5000`). Webhooks are delivered *from* the backend,
   so a local backend can reach this example on localhost directly. (Against
   the deployed backend you'd need a public tunnel, e.g. cloudflared.)

2. In the merchant dashboard:
   - **API Keys** tab → toggle **Test** → **New API key** → copy the
     `pk_test_...` / `sk_test_...` pair.
   - **Webhooks** tab → add endpoint `http://localhost:4242/webhooks/payment-gateway`
     → copy the `whsec_...` secret.

3. ```bash
   cd examples/express-store
   npm install
   # fill in .env values, then (bash):
   export $(grep -v '^#' .env | xargs)   # or set the vars however you prefer
   npm start
   ```

4. Open http://localhost:4242 → **Buy widget** → you're redirected to the
   hosted checkout page. Copy the invoice ID from the URL (or the server log).

5. Stand in for the paying customer:
   ```bash
   curl -X POST http://localhost:4242/dev/simulate/<invoiceId>
   ```
   Watch the server log: the gateway fires a real, signed `invoice.paid`
   webhook back at this server, the middleware verifies it, and the order
   flips to `fulfilled`. Check `http://localhost:4242/orders`.

## What to copy into your own integration

- The **route ordering**: the webhook route is mounted *before*
  `app.use(express.json())` so `webhookMiddleware` can read the raw body.
- The **fast 200 + work after**: respond before fulfilling, the gateway
  times out at 5s.
- The **idempotency check**: retries can deliver the same event twice;
  `invoice_id`/`order_id` is your dedupe key.
- Treating the `/thanks` redirect params as a **UX hint only** — the
  webhook (or a server-side `getInvoice`) is the source of truth.
