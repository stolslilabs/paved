import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PlanType, getPlanKey } from "@paved/game-core";
import { rendererAssets, rendererManifest } from "../vite/renderer-assets";

const KEYS = Object.values(PlanType)
  .filter((p) => p !== PlanType.None)
  .map(getPlanKey);
const APP = resolve(__dirname, "..");
const MODELS = join(APP, "public/renderer-assets/models");
const FOREST = join(MODELS, "forest");
/** The base models' files (the theme folders aside). */
const baseFiles = () => readdirSync(MODELS).filter((n) => n.endsWith(".glb"));

describe("the app's compressed, content-hashed models (scripts/compress-models.ts)", () => {
  it("lists one hashed model per plan, each file present, and nothing else", () => {
    const { models } = rendererManifest();
    expect(Object.keys(models).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) {
      expect(models[key]).toMatch(new RegExp(`^models/${key}\\.[0-9a-f]{10}\\.glb$`));
      expect(existsSync(join(APP, "public/renderer-assets", models[key]!))).toBe(true);
    }
    expect(baseFiles()).toHaveLength(KEYS.length);
    expect(readdirSync(MODELS).filter((n) => !n.endsWith(".glb"))).toEqual(["forest"]);
  });

  it("lists all 19 plans of Forest (theme 1), each a high-forest variant present, in variant order, and nothing else", () => {
    const { themes } = rendererManifest();
    expect(Object.keys(themes)).toEqual(["1"]);
    const forest = themes["1"]!;
    expect(Object.keys(forest).sort()).toEqual([...KEYS].sort());
    const listed = Object.entries(forest).flatMap(([key, files]) => {
      expect(files.length, key).toBeGreaterThan(0);
      files.forEach((file, i) => expect(file).toMatch(new RegExp(`^models/forest/${key}_HF_${i + 1}\\.[0-9a-f]{10}\\.glb$`)));
      return files;
    });
    expect(listed).toHaveLength(72);
    for (const file of listed) expect(existsSync(join(APP, "public/renderer-assets", file))).toBe(true);
    expect(readdirSync(FOREST).sort()).toEqual(listed.map((f) => f.slice("models/forest/".length)).sort());
  });

  it("are meshopt-compressed and quantized glTF binaries", () => {
    for (const path of [...baseFiles().map((n) => join(MODELS, n)), ...readdirSync(FOREST).map((n) => join(FOREST, n))]) {
      const glb = readFileSync(path);
      expect(glb.subarray(0, 4).toString()).toBe("glTF");
      const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString()) as { extensionsRequired?: string[] };
      expect(json.extensionsRequired?.sort()).toEqual(["EXT_meshopt_compression", "KHR_mesh_quantization"]);
    }
  });

  it("are exactly what the script writes from app-web's originals", () => {
    const out = execFileSync(process.execPath, [join(APP, "scripts/compress-models.ts"), "--check"], { encoding: "utf8" });
    expect(out).toContain("base: 19 models");
    expect(out).toContain("forest: 72 models");
  }, 120_000);
});

describe("rendererManifest", () => {
  const dirWith = (files: Record<string, Buffer | string>) => {
    const dir = mkdtempSync(join(tmpdir(), "renderer-manifest-"));
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    return dir;
  };
  const one = baseFiles()[0]!;

  it("keeps the hashed names only", () => {
    const dir = mkdtempSync(join(tmpdir(), "renderer-manifest-"));
    copyFileSync(join(MODELS, one), join(dir, one));
    writeFileSync(join(dir, "ccccccccc.glb"), "plain");
    writeFileSync(join(dir, "notes.txt"), "x");
    expect(rendererManifest(dir)).toEqual({ models: { [one.slice(0, 9)]: `models/${one}` }, themes: {} });
  });

  it("fails when a name's hash is not its file's, or a plan has two files", () => {
    expect(() => rendererManifest(dirWith({ "ccccccccc.0123456789.glb": "edited" }))).toThrow(/hashes to/);
    // Another plan's file under this plan's key: its hash is right, the plan has two models.
    const other = baseFiles()[1]!;
    const dir = dirWith({ [one]: readFileSync(join(MODELS, one)), [`${one.slice(0, 9)}${other.slice(9)}`]: readFileSync(join(MODELS, other)) });
    expect(() => rendererManifest(dir)).toThrow(/two models/);
  });
});

describe("the dev middleware's manifest", () => {
  it("serves the manifest of the app's models, revalidated on every load", async () => {
    const plugin = rendererAssets();
    (plugin.configResolved as (c: unknown) => void)({ base: "/", plugins: [] });
    let handler!: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
    (plugin.configureServer as (s: unknown) => void)({ middlewares: { use: (h: typeof handler) => (handler = h) } });
    const server = createServer((req, res) => handler(req, res, () => res.writeHead(404).end()));
    await new Promise<void>((done) => server.listen(0, done));
    try {
      const res = await fetch(`http://localhost:${(server.address() as AddressInfo).port}/renderer-assets/manifest.json`);
      expect([res.status, res.headers.get("content-type"), res.headers.get("cache-control")]).toEqual([200, "application/json", "no-cache"]);
      expect(await res.json()).toEqual(rendererManifest());
    } finally {
      server.close();
    }
  });
});
