import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { rendererAssets } from "./vite/renderer-assets";

export default defineConfig({
  plugins: [react(), tailwindcss(), rendererAssets()],
  server: {
    port: 5174,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
