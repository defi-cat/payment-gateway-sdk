import { defineConfig } from "vitest/config";

// `npm run test:integration` — hits a live gateway (PG_BASE_URL) with a real
// test-mode API key (PG_API_KEY/PG_API_SECRET). Excluded from `npm test`.
export default defineConfig({
  test: {
    include: ["tests/integration.test.js"],
    testTimeout: 30_000,
  },
});
