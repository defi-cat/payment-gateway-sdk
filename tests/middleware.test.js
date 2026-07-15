import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import { webhookMiddleware } from "../lib/webhooks.js";

const SECRET = "whsec_middleware_test_secret";

const sign = (body) => createHmac("sha256", SECRET).update(body).digest("hex");

// Minimal synthetic Express-ish req/res. req is a real Readable stream so
// the middleware's stream-consumption path is genuinely exercised.
function makeReq(body, headers = {}) {
  const req = Readable.from(body === null ? [] : [Buffer.from(body, "utf8")]);
  req.headers = headers;
  return req;
}

function makeRes() {
  return {
    statusCode: 200,
    ended: false,
    endedWith: undefined,
    end(data) {
      this.ended = true;
      this.endedWith = data;
    },
  };
}

const runMiddleware = (mw, req, res) =>
  new Promise((resolve) => {
    let nextErr;
    let nextCalled = false;
    mw(req, res, (err) => {
      nextCalled = true;
      nextErr = err;
      resolve({ nextCalled, nextErr });
    });
    // If the middleware ends the response instead of calling next, resolve
    // once the stream has been fully consumed.
    req.on("end", () => setImmediate(() => resolve({ nextCalled, nextErr })));
  });

describe("webhookMiddleware", () => {
  it("throws synchronously without a secret", () => {
    expect(() => webhookMiddleware()).toThrow(TypeError);
  });

  it("sets req.webhookEvent and calls next() on a valid signed body", async () => {
    const payload = { event: "invoice.paid", invoice_id: "abc" };
    const body = JSON.stringify(payload);
    const req = makeReq(body, { "x-paygateway-signature": sign(body) });
    const res = makeRes();

    const { nextCalled, nextErr } = await runMiddleware(webhookMiddleware(SECRET), req, res);

    expect(nextCalled).toBe(true);
    expect(nextErr).toBeUndefined();
    expect(req.webhookEvent).toEqual(payload);
    expect(req.rawBody.toString("utf8")).toBe(body);
  });

  it("responds 400 and never calls next() on an invalid signature", async () => {
    const body = JSON.stringify({ event: "invoice.paid" });
    const req = makeReq(body, { "x-paygateway-signature": "bogus" });
    const res = makeRes();

    const { nextCalled } = await runMiddleware(webhookMiddleware(SECRET), req, res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.ended).toBe(true);
  });

  it("responds 400 on a missing signature header", async () => {
    const body = JSON.stringify({ event: "invoice.paid" });
    const req = makeReq(body, {});
    const res = makeRes();

    const { nextCalled } = await runMiddleware(webhookMiddleware(SECRET), req, res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
  });

  it("errors helpfully when the body was already parsed (express.json ran first)", async () => {
    const body = JSON.stringify({ event: "invoice.paid" });
    const req = makeReq(body, { "x-paygateway-signature": sign(body) });
    req.body = { event: "invoice.paid" }; // simulates express.json() having run

    const res = makeRes();
    const { nextCalled, nextErr } = await runMiddleware(webhookMiddleware(SECRET), req, res);

    expect(nextCalled).toBe(true);
    expect(nextErr).toBeInstanceOf(Error);
    expect(nextErr.message).toMatch(/express\.json/);
  });

  it("responds 400 on validly-signed non-JSON body", async () => {
    const body = "definitely not json";
    const req = makeReq(body, { "x-paygateway-signature": sign(body) });
    const res = makeRes();

    const { nextCalled } = await runMiddleware(webhookMiddleware(SECRET), req, res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.endedWith).toBe("invalid JSON");
  });

  it("uses onError instead of the default 400 when provided", async () => {
    const body = JSON.stringify({ event: "invoice.paid" });
    const req = makeReq(body, { "x-paygateway-signature": "bogus" });
    const res = makeRes();

    let onErrorCalled = false;
    const mw = webhookMiddleware(SECRET, {
      onError: (rq, rs) => {
        onErrorCalled = true;
        rs.statusCode = 401;
        rs.end("custom");
      },
    });

    await runMiddleware(mw, req, res);
    expect(onErrorCalled).toBe(true);
    expect(res.statusCode).toBe(401);
  });
});
