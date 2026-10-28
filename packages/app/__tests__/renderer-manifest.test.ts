import { slow } from "../test-slow";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { crc32, deflateSync, inflateSync } from "node:zlib";
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
const TILES = join(APP, "public/renderer-assets/tiles");
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

  it("are exactly what the script writes from the originals in asset-sources/", () => {
    const out = execFileSync(process.execPath, [join(APP, "scripts/compress-models.ts"), "--check"], { encoding: "utf8" });
    expect(out).toContain("base: 19 models");
    expect(out).toContain("forest: 72 models");
  }, slow(120_000));
});

describe("the app's resized, content-hashed tile images (scripts/compress-tiles.ts)", () => {
  it("lists a 256 px image per plan, each present with its hash in its name, and nothing else", () => {
    const { tiles } = rendererManifest();
    expect(Object.keys(tiles)).toEqual(["256"]);
    const listed: string[] = [];
    for (const [size, plans] of Object.entries(tiles)) {
      expect(Object.keys(plans).sort()).toEqual([...KEYS].sort());
      for (const key of KEYS) {
        const path = plans[key]!;
        expect(path).toMatch(new RegExp(`^tiles/${key}\\.${size}\\.[0-9a-f]{10}\\.png$`));
        const png = readFileSync(join(APP, "public/renderer-assets", path));
        // The hash in the name is the file's, and the image is `size` x `size`.
        expect(createHash("sha256").update(png).digest("hex").slice(0, 10)).toBe(path.split(".")[2]);
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([Number(size), Number(size)]);
        listed.push(path.slice("tiles/".length));
      }
    }
    expect(readdirSync(TILES).sort()).toEqual(listed.sort());
  });

  it("are exactly what the script writes from the originals in asset-sources/", () => {
    const out = execFileSync(process.execPath, [join(APP, "scripts/compress-tiles.ts"), "--check"], { encoding: "utf8" });
    expect(out).toContain("19 plans:");
  }, slow(120_000));

  it("fail the check when a copy is stale", () => {
    const [name] = readdirSync(TILES);
    const dir = mkdtempSync(join(tmpdir(), "renderer-tiles-"));
    // The check reads the script's own folders: a copy of the script and its sources beside a stale output.
    const app = join(dir, "app");
    const sources = join(app, "asset-sources/assets/tiles");
    mkdirSync(join(app, "scripts"), { recursive: true });
    mkdirSync(join(app, "public/renderer-assets/tiles"), { recursive: true });
    mkdirSync(sources, { recursive: true });
    copyFileSync(join(APP, "scripts/compress-tiles.ts"), join(app, "scripts/compress-tiles.ts"));
    const source = join(APP, "asset-sources/assets/tiles", `${name!.slice(0, 9)}.png`);
    copyFileSync(source, join(sources, `${name!.slice(0, 9)}.png`));
    // Nothing written yet: stale.
    expect(() => execFileSync(process.execPath, [join(app, "scripts/compress-tiles.ts"), "--check"], { stdio: "pipe" })).toThrow();
    execFileSync(process.execPath, [join(app, "scripts/compress-tiles.ts")], { stdio: "pipe" });
    expect(execFileSync(process.execPath, [join(app, "scripts/compress-tiles.ts"), "--check"], { encoding: "utf8" })).toContain("1 plans:");
    const folder = join(app, "public/renderer-assets/tiles");
    const run = () => execFileSync(process.execPath, [join(app, "scripts/compress-tiles.ts"), "--check"], { stdio: "pipe" });
    const original = readFileSync(join(folder, readdirSync(folder)[0]!));
    /** The file with its pixel data inflated, changed by `edit` and deflated at `level`, named by its new hash (the stream differs, the pixels may not). */
    const rewrite = (level: number, edit: (raw: Buffer) => void) => {
      const written = readdirSync(folder)[0]!;
      const png = readFileSync(join(folder, written));
      const parts: Buffer[] = [];
      const others: Array<[string, Buffer]> = [];
      for (let at = 8; at < png.length; ) {
        const length = png.readUInt32BE(at);
        const type = png.toString("latin1", at + 4, at + 8);
        const body = png.subarray(at + 8, at + 8 + length);
        if (type === "IDAT") parts.push(body);
        else others.push([type, body]);
        at += 12 + length;
      }
      const raw = inflateSync(Buffer.concat(parts));
      edit(raw);
      const chunk = (type: string, body: Buffer) => {
        const head = Buffer.alloc(8);
        head.writeUInt32BE(body.length, 0);
        head.write(type, 4, "latin1");
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
        return Buffer.concat([head, body, crc]);
      };
      const out = Buffer.concat([
        png.subarray(0, 8),
        ...others.filter(([t]) => t === "IHDR").map(([t, b]) => chunk(t, b)),
        chunk("IDAT", deflateSync(raw, { level })),
        chunk("IEND", Buffer.alloc(0)),
      ]);
      rmSync(join(folder, written));
      const name = `${written.slice(0, 14)}${createHash("sha256").update(out).digest("hex").slice(0, 10)}.png`;
      writeFileSync(join(folder, name), out);
      return out;
    };
    // Another deflate level: a different file and hash, the same pixels: still current.
    const other = rewrite(1, () => {});
    expect(other.equals(original)).toBe(false);
    expect(run().toString()).toContain("1 plans:");
    // One pixel changed (a byte of the first row's data), the name still its file's hash: stale.
    rewrite(9, (raw) => void (raw[5] = (raw[5]! + 1) & 0xff));
    expect(() => run()).toThrow();
    // A copy edited under its name, and one extra file: both stale.
    const [current] = readdirSync(folder);
    writeFileSync(join(folder, current!), "edited");
    expect(() => run()).toThrow();
  }, slow(120_000));

  it("fails the manifest when a name's hash is not its file's, or a plan has two images of a size", () => {
    const dir = mkdtempSync(join(tmpdir(), "renderer-tiles-"));
    const models = join(dir, "models");
    const tiles = join(dir, "tiles");
    mkdirSync(models);
    mkdirSync(tiles);
    writeFileSync(join(tiles, "ccccccccc.256.0123456789.png"), "edited");
    expect(() => rendererManifest(models, tiles)).toThrow(/hashes to/);
    const real = readdirSync(TILES).filter((n) => n.includes(".256."));
    rmSync(join(tiles, "ccccccccc.256.0123456789.png"));
    copyFileSync(join(TILES, real[0]!), join(tiles, real[0]!));
    // Another plan's image under this plan's key: its hash is right, the plan has two 256 px images.
    copyFileSync(join(TILES, real[1]!), join(tiles, `${real[0]!.slice(0, 9)}${real[1]!.slice(9)}`));
    expect(() => rendererManifest(models, tiles)).toThrow(/two 256 px images/);
  });
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
    expect(rendererManifest(dir)).toEqual({ models: { [one.slice(0, 9)]: `models/${one}` }, tiles: {}, themes: {}, renders: {} });
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

describe("the tiles' build-time renders (scripts/render-tiles.ts)", () => {
  const RENDERS = join(APP, "public/renderer-assets/renders");

  it("lists a WebP render per plan, its top-down one (#606) and a cover, for the base models and each theme, each Story campaign's background (#721) in its theme and the battle logs' (#857), each with its hash in its name", () => {
    const { renders, themes } = rendererManifest();
    expect(Object.keys(renders).sort()).toEqual(["0", ...Object.keys(themes)].sort());
    // The Tutorial (a puzzle) and Open Country in Default, Dark Forest in Forest, each at the phone's and the grid's width.
    // The battle logs' attack and defence, both in Default, at the phone's width and the wide page's (#857).
    const battle = ["attack", "defence"].flatMap((side) => [720, 1040, 2000].map((width) => `battle-${side}-${width}`));
    const story: Record<string, string[]> = { "0": ["story-1-1040", "story-1-720", "story-2-1040", "story-2-720", ...battle], "1": ["story-3-1040", "story-3-720"] };
    const listed: string[] = [];
    for (const [theme, plans] of Object.entries(renders)) {
      expect(Object.keys(plans).sort()).toEqual([...KEYS, ...KEYS.map((key) => `${key}-top`), "cover", ...(story[theme] ?? [])].sort());
      for (const [key, path] of Object.entries(plans)) {
        expect(path).toMatch(new RegExp(`^renders/${key}\\.${theme}\\.[0-9a-f]{10}\\.webp$`));
        const webp = readFileSync(join(APP, "public/renderer-assets", path));
        expect(webp.subarray(8, 12).toString("latin1")).toBe("WEBP");
        expect(createHash("sha256").update(webp).digest("hex").slice(0, 10)).toBe(path.split(".")[2]);
        listed.push(path.slice("renders/".length));
      }
    }
    expect(readdirSync(RENDERS).sort()).toEqual([...listed, "sources.json"].sort());
  });

  it("are current: every render there, named by its hash, drawn from the manifest's models", () => {
    expect(execFileSync(process.execPath, [join(APP, "scripts/render-tiles.ts"), "--check"], { encoding: "utf8" })).toContain("90 renders: current");
  }, slow(60_000));

  it("fail the check on a missing render, a wrong hash, a model that changed or another version", () => {
    const copy = () => {
      const dir = mkdtempSync(join(tmpdir(), "renders-"));
      for (const name of readdirSync(RENDERS)) copyFileSync(join(RENDERS, name), join(dir, name));
      return dir;
    };
    const check = (dir: string) => () => execFileSync(process.execPath, [join(APP, "scripts/render-tiles.ts"), "--check", "--out", dir], { stdio: "pipe" });
    expect(check(copy())).not.toThrow();
    const missing = copy();
    rmSync(join(missing, readdirSync(missing).find((n) => n.startsWith("cover.1."))!));
    expect(check(missing)).toThrow();
    const edited = copy();
    writeFileSync(join(edited, readdirSync(edited).find((n) => n.endsWith(".webp"))!), "edited");
    expect(check(edited)).toThrow();
    const sources = (dir: string, edit: (s: { version: number; files: Record<string, string[]> }) => void) => {
      const file = join(dir, "sources.json");
      const parsed = JSON.parse(readFileSync(file, "utf8")) as { version: number; files: Record<string, string[]> };
      edit(parsed);
      writeFileSync(file, JSON.stringify(parsed));
      return dir;
    };
    expect(check(sources(copy(), (s) => (s.files[Object.keys(s.files)[0]!] = ["models/ccccccccc.0000000000.glb"])))).toThrow();
    expect(check(sources(copy(), (s) => (s.version += 1)))).toThrow();
  }, slow(60_000));
});
