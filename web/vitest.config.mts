import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Tests share one SQLite file; run files sequentially to avoid write contention.
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: "file:./prisma/test.db",
      APP_ENCRYPTION_KEY: "dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktMTIzNDU=",
      ANTHROPIC_API_KEY: "",
      OPEN_FOOD_FACTS_ENABLED: "false",
      USDA_API_KEY: "",
    },
  },
});
