import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import base from "./vite.config";

// Builds only the bench page (bench.html), so the shipped app (index.html) does not carry it.
//   vite build -c vite.bench.config.ts --outDir dist-bench
//
// BENCH_PROFILE=1 builds the variant used for the CPU profile: not minified, and without the
// wasm / top-level-await plugins (the bench page has no use for them, and their transform
// renames identifiers and breaks the sourcemap that the profile needs to show readable names).
//
// BENCH_PLAY=1 builds the variant of the in-play bench (bench.html?mode=play): the same page
// with react-dom's profiling build, without which the React Profiler reports nothing in a
// production bundle. Kept apart so the board and click figures use the plain production React.
const profile = process.env.BENCH_PROFILE === "1";
const play = process.env.BENCH_PLAY === "1";

export default defineConfig({
  ...base,
  plugins: profile ? [react()] : base.plugins,
  resolve: {
    ...base.resolve,
    alias: {
      ...(base.resolve?.alias as Record<string, string>),
      ...(play ? { "react-dom/client": "react-dom/profiling" } : {}),
    },
  },
  build: {
    ...base.build,
    minify: profile ? false : base.build?.minify,
    rollupOptions: { input: "bench.html" },
  },
});
