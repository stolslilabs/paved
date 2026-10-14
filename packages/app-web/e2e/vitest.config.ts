import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** The Playwright battle test (`bun run e2e`): a real browser, minutes long, so apart from `bun run test`. */
export default defineConfig({
  root: r(".."),
  resolve: {
    alias: {
      "@paved/game-core": r("../../game-core/src"),
      "@paved/chain": r("../../chain/src"),
      "@paved/renderer": r("../../renderer/src"),
      "@paved/renderer/react": r("../../renderer/src/react"),
      "@paved/ui": r("../../ui/src"),
      "react-native": "react-native-web",
    },
  },
  test: {
    include: ["e2e/**/*.e2e.ts"],
    fileParallelism: false,
    testTimeout: 900_000,
    hookTimeout: 120_000,
  },
});
