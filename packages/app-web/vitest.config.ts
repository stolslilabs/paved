import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@paved/game-core": r("../game-core/src"),
      "@paved/chain": r("../chain/src"),
      "@paved/renderer": r("../renderer/src"),
      "@paved/renderer/react": r("../renderer/src/react"),
      "@paved/ui": r("../ui/src"),
      "react-native": "react-native-web",
    },
  },
  test: {
    include: ["__tests__/**/*.test.ts"],
  },
});
