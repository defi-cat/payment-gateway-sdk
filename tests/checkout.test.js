import { describe, it, expect } from "vitest";
import { checkoutUrl, CHECKOUT_BASE_URL } from "../lib/checkout.js";

describe("checkoutUrl", () => {
  it("builds the hosted checkout URL with the default base", () => {
    expect(checkoutUrl("abc-123")).toBe(`${CHECKOUT_BASE_URL}/checkout/abc-123`);
  });

  it("supports a custom base URL", () => {
    expect(checkoutUrl("abc", { baseUrl: "http://localhost:5200" })).toBe(
      "http://localhost:5200/checkout/abc"
    );
  });

  it("strips trailing slashes from the base URL", () => {
    expect(checkoutUrl("abc", { baseUrl: "http://localhost:5200/" })).toBe(
      "http://localhost:5200/checkout/abc"
    );
  });

  it("URL-encodes the invoice id", () => {
    expect(checkoutUrl("a b/c")).toBe(`${CHECKOUT_BASE_URL}/checkout/a%20b%2Fc`);
  });

  it("throws on a missing id", () => {
    expect(() => checkoutUrl()).toThrow(TypeError);
    expect(() => checkoutUrl("")).toThrow(TypeError);
  });
});
