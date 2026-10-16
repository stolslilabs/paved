import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { PlanType, getPlanKey } from "@paved/game-core";
import { isRendererAsset, rendererAssetFiles, rendererAssets } from "../vite/renderer-assets";

const KEYS = Object.values(PlanType)
  .filter((p) => p !== PlanType.None)
  .map(getPlanKey);

/** The dev middleware on a real HTTP server over a temp source; what it passes on (`next`) answers 404, as Vite would. */
async function serveDev(files: Record<string, string>) {
  const source = mkdtempSync(join(tmpdir(), "renderer-assets-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(source, rel)), { recursive: true });
    writeFileSync(join(source, rel), body);
  }
  const plugin = rendererAssets(source);
  (plugin.configResolved as (c: unknown) => void)({ base: "/", plugins: [] });
  let handler!: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
  (plugin.configureServer as (s: unknown) => void)({ middlewares: { use: (h: typeof handler) => (handler = h) } });
  const server = createServer((req, res) =>
    handler(req, res, () => {
      res.statusCode = 404;
      res.end("next");
    }),
  );
  await new Promise<void>((done) => server.listen(0, done));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  return { get: (path: string) => fetch(base + path), close: () => server.close() };
}

describe("the dev middleware", () => {
  it("serves a file with its type and length; a missing or stray request goes on to Vite's 404, never a 500", async () => {
    const dev = await serveDev({ "models/ccccccccc.glb": "glTF", "models/extended/x_HF_1.glb": "no" });
    try {
      const ok = await dev.get("/renderer-assets/models/ccccccccc.glb?v=1");
      expect([ok.status, ok.headers.get("content-type"), ok.headers.get("content-length"), await ok.text()]).toEqual([200, "model/gltf-binary", "4", "glTF"]);
      for (const path of ["/renderer-assets/models/rfrfrfcff.glb", "/renderer-assets/models/extended/x_HF_1.glb", "/renderer-assets/models/%zz.glb", "/other/%zz", "/renderer-assets/%"]) {
        expect([path, (await dev.get(path)).status]).toEqual([path, 404]);
      }
    } finally {
      dev.close();
    }
  });
});

describe("the renderer's assets the app serves (vite/renderer-assets.ts)", () => {
  const files = rendererAssetFiles();

  it("serves exactly what the renderer's AssetLoader requests: a model per plan, the Draco decoder, and no tile image", () => {
    expect(KEYS).toHaveLength(19);
    for (const key of KEYS) {
      expect(files).toContain(`models/${key}.glb`);
    }
    expect(files.filter((f) => f.startsWith("draco/"))).toEqual(["draco/draco_decoder.js", "draco/draco_decoder.wasm", "draco/draco_wasm_wrapper.js"]);
    expect(files).toHaveLength(KEYS.length + 3);
    expect(files.filter((f) => f.startsWith("assets/tiles/"))).toEqual([]);
  });

  it("leaves out what the renderer never requests", () => {
    for (const path of ["models/extended/rfrfffcfr_HF_2.glb", "assets/tiles/00.png", "assets/tiles/ccccccccc.png", "THIRD_PARTY_NOTICES.txt", "draco/README.md", "models/../secret.glb"]) {
      expect(isRendererAsset(path)).toBe(false);
    }
  });
});

describe("the build ships no original tile image (TILE-CHIP)", () => {
  it("emits the manifest and no assets/tiles file", () => {
    const emitted: string[] = [];
    const plugin = rendererAssets();
    (plugin.configResolved as (c: unknown) => void)({ base: "/", plugins: [] });
    (plugin.generateBundle as (this: { emitFile: (f: { fileName: string }) => void }) => void).call({ emitFile: (f) => emitted.push(f.fileName) });
    expect(emitted).toEqual(["renderer-assets/manifest.json"]);
  });
});
