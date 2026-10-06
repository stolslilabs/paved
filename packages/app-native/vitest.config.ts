import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // The subpath first: aliases match by prefix, in this order.
      "@paved/renderer/react-native": resolve(__dirname, "../renderer/src/react-native/index.ts"),
      "@paved/renderer": resolve(__dirname, "../renderer/src/index.ts"),
    },
  },
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
