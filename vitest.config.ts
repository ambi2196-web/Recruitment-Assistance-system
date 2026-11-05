import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    include: ["lib/**/*.test.ts"],
    // An in-memory database, so tests never touch local or deployed data.
    env: {
      DATABASE_URL: "memory://",
      LLM_PROVIDER: "mock",
      LLM_MODEL: "mock-1",
      MONTHLY_BUDGET_USD: "5",
    },
  },
});
