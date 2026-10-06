import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import base from "./vite.config";

// Builds only the bench page (bench.html), so the shipped app (index.html) does not carry it.
//   vite build -c vite.bench.config.ts --outDir dist-bench
//
// BENCH_PROFILE=1 builds the variant used for the CPU profile: not minified, and without the
// wasm / top-level-await plugins (the bench page has no use for them, and their transform
// renames identifiers and breaks the sourcemap that the profile needs to show readable names).
const profile = process.env.BENCH_PROFILE === "1";

export default defineConfig({
  ...base,
  plugins: profile ? [react()] : base.plugins,
  build: {
    ...base.build,
    minify: profile ? false : base.build?.minify,
    rollupOptions: { input: "bench.html" },
  },
});
