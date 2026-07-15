import { defineConfig } from "vitest/config";

// Default `npm test` is fast and network-free. The integration suite
// (tests/integration.test.js) needs a live gateway + test API key, so it
// only runs via `npm run test:integration`.
export default defineConfig({
  test: {
    exclude: ["node_modules/**", "tests/integration.test.js"],
  },
});
