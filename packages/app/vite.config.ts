import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { rendererAssets } from "./vite/renderer-assets.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), rendererAssets()],
  server: {
    port: 5174,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rolldownOptions: {
      treeshake: {
        // `@paved/game-core` has no `sideEffects` field, so a bundle that imports one name from it keeps every module of
        // its barrel, the engine and its hashing included. Its modules only declare (classes, tables, functions): the
        // names a chunk does not use can go, and the first load stops carrying the engine.
        moduleSideEffects: [{ test: /[\\/]packages[\\/]game-core[\\/]dist[\\/]/, sideEffects: false }],
      },
      output: {
        // `@paved/game-core` apart from what the first route reads (the formatters, the Training save's storage, the
        // barrel) in one chunk of its own, with the hashing under the engine: the pages that play share it, and the
        // first route does not fetch it.
        codeSplitting: {
          groups: [
            {
              name: "engine",
              test: /[\\/](game-core[\\/]dist[\\/](?!format\.js|index\.js|constants\.js|sessions[\\/](storage|training-storage|index)\.js)|@scure|@noble)/,
              priority: 10,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
});
