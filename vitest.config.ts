import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    include: ["lib/**/*.test.ts"],
    // Starting PGlite and the file parsers can be slow on a busy laptop.
    // One unexplained run failed during start-up, so start-up gets more time.
    hookTimeout: 30_000,
    testTimeout: 20_000,
    // An in-memory database, so tests never touch local or deployed data.
    env: {
      DATABASE_URL: "memory://",
      LLM_PROVIDER: "mock",
      LLM_MODEL: "mock-1",
      MONTHLY_BUDGET_USD: "5",
    },
  },
});
