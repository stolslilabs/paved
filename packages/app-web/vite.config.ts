import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      "@paved/game-core": new URL("../game-core/src", import.meta.url).pathname,
      "@paved/chain": new URL("../chain/src", import.meta.url).pathname,
      "@paved/renderer": new URL("../renderer/src", import.meta.url).pathname,
      "@paved/renderer/react": new URL("../renderer/src/react", import.meta.url).pathname,
      "@paved/ui": new URL("../ui/src", import.meta.url).pathname,
      "react-native": "react-native-web",
    },
  },
  define: {
    "process.env": {
      NODE_ENV: JSON.stringify(process.env.NODE_ENV || "development"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
