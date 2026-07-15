import { describe, it, expect, vi } from "vitest";
import { PaymentGateway, API_BASE_URL } from "../lib/client.js";
import { PaymentGatewayError } from "../lib/errors.js";
import { CHECKOUT_BASE_URL } from "../lib/checkout.js";

const KEY = "pk_test_0123456789abcdef";
const SECRET = "sk_test_0123456789abcdef0123456789abcdef";

const jsonResponse = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const makeGateway = (fetchImpl, extra = {}) =>
  new PaymentGateway({ apiKey: KEY, apiSecret: SECRET, fetch: fetchImpl, ...extra });

describe("PaymentGateway constructor", () => {
  it("throws on missing or misprefixed credentials", () => {
    expect(() => new PaymentGateway({})).toThrow(TypeError);
    expect(() => new PaymentGateway({ apiKey: "wrong", apiSecret: SECRET })).toThrow(TypeError);
    expect(() => new PaymentGateway({ apiKey: KEY, apiSecret: "wrong" })).toThrow(TypeError);
  });

  it("reports isTestMode from the key prefix", () => {
    expect(makeGateway(vi.fn()).isTestMode).toBe(true);
    const live = new PaymentGateway({ apiKey: "pk_live_x", apiSecret: "sk_live_x", fetch: vi.fn() });
    expect(live.isTestMode).toBe(false);
  });

  it("does not leak the secret through util.inspect", async () => {
    const { inspect } = await import("node:util");
    const gw = makeGateway(vi.fn());
    expect(inspect(gw)).not.toContain(SECRET);
  });
});

describe("createInvoice", () => {
  it("sends the right URL, method, auth headers, and body; defaults currency to USDT", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { invoice_id: "i1", is_test: true })
    );
    const gw = makeGateway(fetchMock);

    const result = await gw.createInvoice({ amount: 5, chain: "POLYGON", order_id: "o1" });
    expect(result.invoice_id).toBe("i1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/payments/invoice`);
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe(KEY);
    expect(init.headers["x-api-secret"]).toBe(SECRET);
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      currency: "USDT",
      amount: 5,
      chain: "POLYGON",
      order_id: "o1",
    });
  });

  it("strips trailing slash from a custom baseUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, {}));
    const gw = makeGateway(fetchMock, { baseUrl: "http://localhost:5000/" });
    await gw.createInvoice({ amount: 1, chain: "BSC" });
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:5000/api/payments/invoice");
  });

  it("enforces amount XOR fiat_amount synchronously", async () => {
    const gw = makeGateway(vi.fn());
    await expect(() => gw.createInvoice({ chain: "BSC" })).rejects.toThrow(TypeError);
    await expect(() =>
      gw.createInvoice({ amount: 1, fiat_amount: 10, fiat_currency: "USD", chain: "BSC" })
    ).rejects.toThrow(TypeError);
  });

  it("requires chain synchronously", async () => {
    const gw = makeGateway(vi.fn());
    await expect(() => gw.createInvoice({ amount: 1 })).rejects.toThrow(TypeError);
  });
});

describe("unauthenticated endpoints", () => {
  it("getInvoice and checkInvoice send NO auth headers", async () => {
    // Fresh Response per call — a Response body can only be read once.
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, { invoice_id: "i1" }));
    const gw = makeGateway(fetchMock);

    await gw.getInvoice("i1");
    await gw.checkInvoice("i1");

    for (const [url, init] of fetchMock.mock.calls) {
      expect(init.headers["x-api-key"]).toBeUndefined();
      expect(init.headers["x-api-secret"]).toBeUndefined();
      expect(url).toContain("/api/payments/invoice/i1");
    }
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
    expect(fetchMock.mock.calls[1][0]).toContain("/check");
  });

  it("simulatePayment DOES send auth headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { status: "paid" }));
    const gw = makeGateway(fetchMock);
    await gw.simulatePayment("i1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/simulate-payment");
    expect(init.headers["x-api-key"]).toBe(KEY);
  });

  it("URL-encodes invoice ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const gw = makeGateway(fetchMock);
    await gw.getInvoice("a/b c");
    expect(fetchMock.mock.calls[0][0]).toContain("/api/payments/invoice/a%2Fb%20c");
  });
});

describe("error mapping", () => {
  it("maps a 400 validation response to isValidationError with issues", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        error: "Validation failed",
        issues: [{ path: ["chain"], message: "Invalid enum value" }],
      })
    );
    const gw = makeGateway(fetchMock);

    const err = await gw.createInvoice({ amount: 1, chain: "DOGE" }).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentGatewayError);
    expect(err.isValidationError).toBe(true);
    expect(err.issues).toHaveLength(1);
    expect(err.message).toContain("chain");
  });

  it("maps 401 to isAuthError and 404 to isNotFound", async () => {
    const gw401 = makeGateway(vi.fn().mockResolvedValue(jsonResponse(401, { error: "Invalid or revoked API credentials" })));
    const err401 = await gw401.simulatePayment("i1").catch((e) => e);
    expect(err401.isAuthError).toBe(true);

    const gw404 = makeGateway(vi.fn().mockResolvedValue(jsonResponse(404, { error: "Invoice not found" })));
    const err404 = await gw404.getInvoice("nope").catch((e) => e);
    expect(err404.isNotFound).toBe(true);
    expect(err404.message).toContain("Invoice not found");
  });

  it("maps 429 with Retry-After to retryAfterSeconds", async () => {
    const gw = makeGateway(
      vi.fn().mockResolvedValue(jsonResponse(429, { error: "Too many requests" }, { "retry-after": "120" }))
    );
    const err = await gw.checkInvoice("i1").catch((e) => e);
    expect(err.isRateLimited).toBe(true);
    expect(err.retryAfterSeconds).toBe(120);
  });

  it("maps a network failure to status 0 with cause", async () => {
    const boom = new Error("getaddrinfo ENOTFOUND");
    const gw = makeGateway(vi.fn().mockRejectedValue(boom));
    const err = await gw.getInvoice("i1").catch((e) => e);
    expect(err).toBeInstanceOf(PaymentGatewayError);
    expect(err.status).toBe(0);
    expect(err.cause).toBe(boom);
  });

  it("survives a non-JSON error body", async () => {
    const gw = makeGateway(
      vi.fn().mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }))
    );
    const err = await gw.getInvoice("i1").catch((e) => e);
    expect(err.status).toBe(502);
  });
});

describe("checkoutUrl (instance)", () => {
  it("uses the default checkout base", () => {
    const gw = makeGateway(vi.fn());
    expect(gw.checkoutUrl("i1")).toBe(`${CHECKOUT_BASE_URL}/checkout/i1`);
  });

  it("uses a custom checkoutBaseUrl", () => {
    const gw = makeGateway(vi.fn(), { checkoutBaseUrl: "http://localhost:5200" });
    expect(gw.checkoutUrl("i1")).toBe("http://localhost:5200/checkout/i1");
  });
});
