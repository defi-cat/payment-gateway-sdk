/**
 * Error thrown for every failed API request — network failures (status 0),
 * validation errors (400 with `issues`), auth failures (401), rate limits
 * (429), and everything else the gateway can return.
 */
export class PaymentGatewayError extends Error {
  /** @type {number} HTTP status code; 0 for network/timeout failures. */
  status;
  /** @type {Array<object>} Validation issues from a 400 response, else []. */
  issues;
  /** @type {unknown} The parsed response body, if any. */
  body;
  /** @type {number|undefined} Seconds until retry is allowed, on 429. */
  retryAfterSeconds;

  constructor(message, { status = 0, issues = [], body = null, retryAfterSeconds, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "PaymentGatewayError";
    this.status = status;
    this.issues = issues;
    this.body = body;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  get isValidationError() {
    return this.status === 400 && this.issues.length > 0;
  }

  get isAuthError() {
    return this.status === 401;
  }

  get isRateLimited() {
    return this.status === 429;
  }

  get isNotFound() {
    return this.status === 404;
  }

  /**
   * @param {Response} res
   * @param {unknown} data parsed response body (may be null)
   */
  static fromResponse(res, data) {
    const issues = Array.isArray(data?.issues) ? data.issues : [];
    const baseMessage = data?.error || data?.message || res.statusText || "Request failed";

    let message = `${baseMessage} (${res.status})`;
    if (issues.length > 0) {
      const detail = issues
        .map((i) => `${(i.path || []).join(".") || "body"}: ${i.message}`)
        .join("; ");
      message += ` — ${detail}`;
    }

    let retryAfterSeconds;
    if (res.status === 429) {
      const retryAfter = res.headers?.get?.("retry-after") ?? res.headers?.get?.("ratelimit-reset");
      const parsed = Number(retryAfter);
      if (Number.isFinite(parsed) && parsed >= 0) retryAfterSeconds = parsed;
    }

    return new PaymentGatewayError(message, {
      status: res.status,
      issues,
      body: data,
      retryAfterSeconds,
    });
  }
}

/**
 * Thrown by constructEvent() when a webhook's signature doesn't verify or
 * its body isn't valid JSON. Never thrown by verifyWebhookSignature(),
 * which returns a boolean instead.
 */
export class WebhookVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}
