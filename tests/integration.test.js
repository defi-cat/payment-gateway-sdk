import { describe, it, expect } from "vitest";
import { PaymentGateway } from "../index.js";

/**
 * Full-lifecycle test against a LIVE gateway. Requires env:
 *   PG_API_KEY    a pk_test_... key (MUST be test mode — creates sandbox invoices)
 *   PG_API_SECRET the matching sk_test_... secret
 *   PG_BASE_URL   optional, defaults to http://localhost:5000
 *
 * Run: npm run test:integration
 * Skipped entirely when PG_API_KEY is unset.
 */
const apiKey = process.env.PG_API_KEY;
const apiSecret = process.env.PG_API_SECRET;
const baseUrl = process.env.PG_BASE_URL || "http://localhost:5000";

describe.skipIf(!apiKey)("live gateway lifecycle (test mode)", () => {
  const gw = apiKey
    ? new PaymentGateway({ apiKey, apiSecret, baseUrl })
    : null;

  it("refuses to run with a live key", () => {
    // Guard: this suite creates invoices and simulates payments — never
    // point it at live credentials.
    expect(gw.isTestMode).toBe(true);
  });

  it("create → get → simulate → paid → check done", async () => {
    const invoice = await gw.createInvoice({
      amount: 7,
      chain: "POLYGON",
      order_id: "sdk-integration-test",
    });
    expect(invoice.is_test).toBe(true);
    expect(invoice.status).toBe("created");
    expect(gw.checkoutUrl(invoice.invoice_id)).toContain(invoice.invoice_id);

    const fetched = await gw.getInvoice(invoice.invoice_id);
    expect(fetched.invoice_id).toBe(invoice.invoice_id);
    expect(fetched.is_test).toBe(true);

    const simulated = await gw.simulatePayment(invoice.invoice_id);
    expect(simulated.status).toBe("paid");
    expect(Number(simulated.fee_amount) + Number(simulated.net_amount)).toBeCloseTo(
      Number(simulated.paid_amount),
      8
    );

    const check = await gw.checkInvoice(invoice.invoice_id);
    expect(check.done).toBe(true);
    expect(check.status).toBe("paid");
  });

  it("simulate-payment on an already-paid invoice → 400", async () => {
    const invoice = await gw.createInvoice({ amount: 2, chain: "POLYGON" });
    await gw.simulatePayment(invoice.invoice_id);

    const err = await gw.simulatePayment(invoice.invoice_id).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/already paid/i);
  });
});
