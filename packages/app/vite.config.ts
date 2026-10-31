import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { offlineWorker } from "./vite/offline-worker.ts";
import { preloadTrim } from "./vite/preload-trim.ts";
import { rendererAssets } from "./vite/renderer-assets.ts";
import { dataSourceOf } from "./src/data/source-of.ts";

/**
 * A mock build carries no starknet.js (#927): `starknet` resolves to `src/data/mock/starknet-shim.ts`, the few pure helpers the
 * mock's way through `@paved/chain` calls and nothing that reaches a node. No chunk of the build can fetch starknet.js then, and
 * `scripts/bundle-budget.ts` checks none holds it. With it, a mock build writes its offline worker (`vite/offline-worker.ts`).
 * Both are named `paved:mock-*`, so the Storybook can leave them out (`.storybook/main.ts`).
 */
export function mockWithoutStarknet(): Plugin {
  return {
    name: "paved:mock-without-starknet",
    config: () => ({ resolve: { alias: [{ find: /^starknet$/, replacement: resolve(import.meta.dirname, "src/data/mock/starknet-shim.ts") }] } }),
  };
}

export default defineConfig(({ command, mode }) => {
  // The build's source as the app reads it (`data/data-source.ts`): the `VITE_*` values of the environment and of the `.env`
  // files, the dev server without a network being devnet's.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const mock = dataSourceOf({ source: env.VITE_DATA_SOURCE, network: env.VITE_NETWORK || (command === "serve" ? "devnet" : "") }) === "mock";
  return {
    plugins: [react(), tailwindcss(), rendererAssets(), preloadTrim(), ...(mock ? [mockWithoutStarknet(), offlineWorker()] : [])],
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
          // `@paved/game-core` apart from what the first route reads (the formatters, the device's storage, the barrel) in one chunk of its own, with the hashing under the engine: the pages that play share it, and the
          // first route does not fetch it.
          codeSplitting: {
            groups: [
              {
                name: "engine",
                test: /[\\/](game-core[\\/]dist[\\/](?!format\.js|index\.js|constants\.js|sessions[\\/](storage|index)\.js)|@scure|@noble)/,
                priority: 10,
                includeDependenciesRecursively: false,
              },
            ],
          },
        },
      },
    },
  };
});
