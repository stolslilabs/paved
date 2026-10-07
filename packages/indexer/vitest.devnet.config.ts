import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/devnet/**/*.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
