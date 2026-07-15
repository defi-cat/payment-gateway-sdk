import { createHmac, timingSafeEqual } from "node:crypto";
import { WebhookVerificationError } from "./errors.js";

export const SIGNATURE_HEADER = "x-paygateway-signature";

/**
 * Verifies a webhook's X-PayGateway-Signature header.
 *
 * IMPORTANT: pass the request body EXACTLY as received (string or Buffer).
 * Never JSON.parse it and re-stringify — a different serializer can reorder
 * keys or change whitespace, and the signature is over the exact bytes the
 * gateway sent.
 *
 * @param {string|Buffer} rawBody the raw request body as received
 * @param {string} signature the X-PayGateway-Signature header value
 * @param {string} secret your whsec_... endpoint secret
 * @returns {boolean}
 */
export function verifyWebhookSignature(rawBody, signature, secret) {
  if (typeof signature !== "string" || signature.length === 0) return false;
  if (typeof secret !== "string" || secret.length === 0) return false;
  if (rawBody == null) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");

  // timingSafeEqual THROWS on length mismatch — check first, return false.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verify + parse in one step (Stripe-style). Returns the parsed event
 * object on success; throws WebhookVerificationError on a bad signature
 * or unparseable body.
 *
 * @param {string|Buffer} rawBody
 * @param {string} signature
 * @param {string} secret
 * @returns {object} the parsed webhook event
 */
export function constructEvent(rawBody, signature, secret) {
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    throw new WebhookVerificationError(
      "Webhook signature verification failed. Check that you're passing the raw request body (not a re-serialized object) and the correct whsec_ secret."
    );
  }
  try {
    return JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new WebhookVerificationError("Webhook body is not valid JSON.");
  }
}

/**
 * Express middleware factory. Reads the raw request stream itself (so it
 * doesn't depend on express.raw or a body parser being configured), verifies
 * the signature, then sets:
 *
 *   req.webhookEvent  — the parsed event object
 *   req.rawBody       — the raw body Buffer
 *
 * On an invalid signature it responds 400 and never calls your handler.
 *
 * Mount it on the webhook route ONLY, before any app-wide express.json():
 *
 *   app.post("/webhooks/payment-gateway", webhookMiddleware(secret), (req, res) => {
 *     res.sendStatus(200); // respond fast, then act on req.webhookEvent
 *   });
 *
 * @param {string} secret your whsec_... endpoint secret
 * @param {{ onError?: (req: any, res: any) => void }} [options]
 */
export function webhookMiddleware(secret, { onError } = {}) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new TypeError("webhookMiddleware requires your whsec_... endpoint secret");
  }

  return (req, res, next) => {
    if (req.body !== undefined || req._body || req.readableEnded) {
      return next(
        new Error(
          "payment-gateway-sdk: the request body was already consumed by another parser. Mount webhookMiddleware on the webhook route BEFORE app.use(express.json()), or exclude the webhook path from your JSON parser."
        )
      );
    }

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("error", next);
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const signature = req.headers[SIGNATURE_HEADER];

      if (!verifyWebhookSignature(raw, signature, secret)) {
        if (onError) return onError(req, res);
        res.statusCode = 400;
        return res.end("invalid signature");
      }

      req.rawBody = raw;
      try {
        req.webhookEvent = JSON.parse(raw.toString("utf8"));
      } catch {
        res.statusCode = 400;
        return res.end("invalid JSON");
      }
      next();
    });
  };
}
