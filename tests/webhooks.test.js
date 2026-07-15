import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature, constructEvent } from "../lib/webhooks.js";
import { WebhookVerificationError } from "../lib/errors.js";

const SECRET = "whsec_test_secret_for_unit_tests";

const sign = (body, secret = SECRET) =>
  createHmac("sha256", secret).update(body).digest("hex");

describe("verifyWebhookSignature", () => {
  it("accepts a valid signature", () => {
    const body = JSON.stringify({ event: "invoice.paid", invoice_id: "abc" });
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ event: "invoice.paid", invoice_id: "abc" });
    const tampered = JSON.stringify({ event: "invoice.paid", invoice_id: "EVIL" });
    expect(verifyWebhookSignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it("rejects a wrong-length signature without throwing (the timingSafeEqual trap)", () => {
    const body = JSON.stringify({ event: "invoice.paid" });
    expect(() => verifyWebhookSignature(body, "deadbeef", SECRET)).not.toThrow();
    expect(verifyWebhookSignature(body, "deadbeef", SECRET)).toBe(false);
  });

  it("accepts Buffer and string rawBody identically", () => {
    const body = JSON.stringify({ event: "invoice.expired", invoice_id: "x" });
    const sig = sign(body);
    expect(verifyWebhookSignature(body, sig, SECRET)).toBe(true);
    expect(verifyWebhookSignature(Buffer.from(body, "utf8"), sig, SECRET)).toBe(true);
  });

  it("rejects missing/empty signature or secret without throwing", () => {
    const body = JSON.stringify({ event: "invoice.paid" });
    expect(verifyWebhookSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body), "")).toBe(false);
    expect(verifyWebhookSignature(null, sign(body), SECRET)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const body = JSON.stringify({ event: "invoice.paid" });
    expect(verifyWebhookSignature(body, sign(body, "whsec_other"), SECRET)).toBe(false);
  });

  it("is case-insensitive on the hex signature", () => {
    const body = JSON.stringify({ event: "invoice.paid" });
    expect(verifyWebhookSignature(body, sign(body).toUpperCase(), SECRET)).toBe(true);
  });

  // Regression test documenting THE nuance: the gateway signs Node's
  // JSON.stringify(payload) and sends those exact bytes. Verifying the raw
  // received body works; re-serializing a parsed object with different key
  // order does not.
  it("fails against a re-serialized body with different key order", () => {
    const original = JSON.stringify({ event: "invoice.paid", invoice_id: "abc" });
    const sig = sign(original);
    const reordered = JSON.stringify({ invoice_id: "abc", event: "invoice.paid" });
    expect(verifyWebhookSignature(original, sig, SECRET)).toBe(true);
    expect(verifyWebhookSignature(reordered, sig, SECRET)).toBe(false);
  });
});

describe("constructEvent", () => {
  it("returns the parsed event on a valid signature", () => {
    const payload = { event: "invoice.paid", invoice_id: "abc", order_id: "o1" };
    const body = JSON.stringify(payload);
    expect(constructEvent(body, sign(body), SECRET)).toEqual(payload);
  });

  it("throws WebhookVerificationError on an invalid signature", () => {
    const body = JSON.stringify({ event: "invoice.paid" });
    expect(() => constructEvent(body, "bad", SECRET)).toThrow(WebhookVerificationError);
  });

  it("throws WebhookVerificationError on validly-signed non-JSON", () => {
    const body = "not json at all";
    expect(() => constructEvent(body, sign(body), SECRET)).toThrow(WebhookVerificationError);
  });
});
