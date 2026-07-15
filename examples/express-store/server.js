/**
 * Minimal example store showing the full payment lifecycle in TEST MODE —
 * no real crypto ever moves:
 *
 *   1. Customer clicks Buy            → POST /buy creates an invoice and
 *                                       redirects to the hosted checkout
 *   2. (test mode stand-in for the customer paying)
 *      POST /dev/simulate/:invoiceId  → gateway marks it paid and fires the
 *                                       REAL invoice.paid webhook
 *   3. Webhook arrives                → signature verified, order fulfilled
 *   4. Customer lands on /thanks      → shows the server-side order state
 *
 * Setup (see README.md next to this file):
 *   PG_API_KEY=pk_test_...      PG_API_SECRET=sk_test_...
 *   PG_WEBHOOK_SECRET=whsec_... PG_BASE_URL=http://localhost:5000
 */
import express from "express";
import {
  PaymentGateway,
  webhookMiddleware,
} from "@defi-cat/payment-gateway-sdk";

const {
  PG_API_KEY,
  PG_API_SECRET,
  PG_WEBHOOK_SECRET,
  PG_BASE_URL = "http://localhost:5000",
  PG_CHECKOUT_URL,
  PORT = 4242,
} = process.env;

if (!PG_API_KEY || !PG_API_SECRET || !PG_WEBHOOK_SECRET) {
  console.error("Set PG_API_KEY, PG_API_SECRET and PG_WEBHOOK_SECRET first — see README.md");
  process.exit(1);
}

const gw = new PaymentGateway({
  apiKey: PG_API_KEY,
  apiSecret: PG_API_SECRET,
  baseUrl: PG_BASE_URL,
  ...(PG_CHECKOUT_URL ? { checkoutBaseUrl: PG_CHECKOUT_URL } : {}),
});

if (!gw.isTestMode) {
  console.error("This example is test-mode only — use a pk_test_ key.");
  process.exit(1);
}

const app = express();

// In-memory "database". A real store would persist this.
const orders = new Map(); // orderId -> { status, invoiceId }

// ── The webhook route, mounted BEFORE express.json() so the middleware can
//    read the raw body and verify the signature. This ordering matters.
app.post(
  "/webhooks/payment-gateway",
  webhookMiddleware(PG_WEBHOOK_SECRET),
  (req, res) => {
    // Respond fast — the gateway times out at 5s and will retry otherwise.
    res.sendStatus(200);

    const event = req.webhookEvent;
    console.log(`🔔 webhook: ${event.event} for invoice ${event.invoice_id}`);

    const order = orders.get(event.order_id);
    if (!order) return;

    if (event.event === "invoice.paid") {
      // Idempotent: retries can deliver the same event more than once.
      if (order.status === "fulfilled") {
        console.log(`   order ${event.order_id} already fulfilled — deduped`);
        return;
      }
      order.status = "fulfilled";
      console.log(`✅ order ${event.order_id} fulfilled (net ${event.net_amount} ${event.currency})`);
    } else if (event.event === "invoice.expired") {
      order.status = "abandoned";
      console.log(`⏰ order ${event.order_id} abandoned — invoice expired unpaid`);
    }
  }
);

app.use(express.json());

app.get("/", (req, res) => {
  res.type("html").send(`
    <h1>Example Store</h1>
    <form method="POST" action="/buy">
      <button type="submit">Buy widget — 5 USDT</button>
    </form>
  `);
});

app.post("/buy", async (req, res) => {
  const orderId = `order-${Date.now()}`;
  try {
    const invoice = await gw.createInvoice({
      amount: 5,
      chain: "POLYGON",
      order_id: orderId,
      success_url: `http://localhost:${PORT}/thanks`,
      cancel_url: `http://localhost:${PORT}/`,
    });
    orders.set(orderId, { status: "awaiting_payment", invoiceId: invoice.invoice_id });
    console.log(`🧾 created invoice ${invoice.invoice_id} for ${orderId}`);
    console.log(`   simulate payment with: curl -X POST http://localhost:${PORT}/dev/simulate/${invoice.invoice_id}`);
    res.redirect(302, gw.checkoutUrl(invoice.invoice_id));
  } catch (err) {
    console.error("createInvoice failed:", err.message);
    res.status(500).send(`Could not create invoice: ${err.message}`);
  }
});

// The customer lands here via the checkout page's success redirect, which
// carries ?invoice_id=&status=&order_id=. UX hint ONLY — real payment truth
// comes from the webhook (or gw.getInvoice server-side), never the URL.
app.get("/thanks", (req, res) => {
  const { invoice_id, status, order_id } = req.query;
  const order = orders.get(order_id);
  res.type("html").send(`
    <h1>Thanks!</h1>
    <p>Redirect says: invoice ${invoice_id ?? "?"} is "${status ?? "?"}"</p>
    <p>Server says: order ${order_id ?? "?"} is "${order?.status ?? "unknown"}"</p>
  `);
});

// Test-mode helper: stands in for the customer actually paying. Triggers
// the gateway's REAL webhook pipeline back to this server.
app.post("/dev/simulate/:invoiceId", async (req, res) => {
  try {
    const result = await gw.simulatePayment(req.params.invoiceId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Debug: current order states.
app.get("/orders", (req, res) => {
  res.json(Object.fromEntries(orders));
});

app.listen(PORT, () => {
  console.log(`🛍️ Example store on http://localhost:${PORT} (gateway: ${PG_BASE_URL})`);
});
