import { rmSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { rendererAssets } from "./vite/renderer-assets.ts";

/**
 * `public/fontawesome/source/` holds the owner's whole Font Awesome files (2 MB), the input of `scripts/fa-subset.ts`.
 * Vite copies `public/` as it is; this takes them out of `dist/` once the copy is done.
 */
function fontAwesomeSourceOutOfDist(): Plugin {
  let outDir = "dist";
  return {
    name: "font-awesome-source-out-of-dist",
    apply: "build",
    configResolved: (config) => void (outDir = join(config.root, config.build.outDir)),
    closeBundle: () => rmSync(join(outDir, "fontawesome/source"), { recursive: true, force: true }),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), rendererAssets(), fontAwesomeSourceOutOfDist()],
  server: {
    port: 5174,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
