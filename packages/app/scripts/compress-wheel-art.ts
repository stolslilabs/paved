/**
 * SEASON-WHEEL: the season wheel's layers, WebP copies of the masters in `wheel-sources/`.
 *
 *   node scripts/compress-wheel-art.ts [--check]
 *
 * Reads `wheel-sources/<layer>.webp`, one transparent lossless square WebP per layer (`WHEEL_ART` in
 * `src/components/elements/wheel-art.ts`: the full-dial layers at 1024 px, the dial centred; the sun and the moon at 512 px), left
 * untouched and never shipped (not in `public/`), and writes `public/wheel-art/<layer>/<size>.webp` for each size of the layer.
 * Each run removes the copies of an earlier one. `--check` encodes nothing and fails when a master is missing, extra or not of its
 * frame, or a copy is missing, extra, not a WebP, or not of its size.
 *
 * The masters were art-directed and generated with OpenAI's image model through the Codex CLI (`codex exec -c
 * model_provider='"openai"'`), each step chosen by the owner on 2026-10-31: the seasons as one little planet (generated whole, then
 * centred, turned so its seasons sit on their quarters, and cut to the ring), the painted day and night sky cut to its 135° night
 * and 225° day, and the hardware in the player badge's stone and gold, each part alone, then cut with exact masks (Pillow,
 * NumPy). The two turning layers carry a warm-grey treatment (60 % of their chroma, 90 % contrast, 97 % brightness). Stored as
 * lossless WebP (`cwebp -lossless -z 9 -exact`).
 *
 * Per copy: resized and encoded as lossy WebP with its alpha (`cwebp`, `-m 6 -sharp_yuv -alpha_q 100`, no metadata) at the quality
 * of `QUALITY`, under `nice -n 10`. No package: `cwebp` is libwebp's command-line tool (`brew install webp`, `apt install webp`),
 * needed only to write. Node 24 runs this as is (type stripping): the syntax stays erasable.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WHEEL_ART, type WheelLayer } from "../src/components/elements/wheel-art.ts";
import { webpSize } from "./compress-music-art.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCE = resolve(HERE, "../wheel-sources");
export const OUT = resolve(HERE, "../public/wheel-art");

const LAYERS = Object.keys(WHEEL_ART) as WheelLayer[];

/** The quality per layer: the painted discs and the stones carry the detail; the shade is a soft gradient. */
const QUALITY: Record<WheelLayer, number> = {
  "season-ring": 84,
  "time-disc": 82,
  "icon-sun": 84,
  "icon-moon": 84,
  shade: 78,
  "inner-bezel": 82,
  frame: 84,
  pointer: 84,
  hub: 82,
};

/** The masters a run reads, as `<layer>.webp`. */
export const masters = () => LAYERS.map((layer) => `${layer}.webp`).sort();

/** The files a run writes, as `<layer>/<size>.webp`. */
export const expected = () => LAYERS.flatMap((layer) => WHEEL_ART[layer].sizes.map((size) => `${layer}/${size}.webp`)).sort();

const walk = (dir: string, base = dir): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n), base) : [join(dir, n).slice(base.length + 1)]));

const kib = (n: number) => `${(n / 1024).toFixed(1)} KiB`;

/** What is wrong with the masters and the copies, if anything. */
export function problems(source = SOURCE, out = OUT): string[] {
  const found: string[] = [];
  const have = walk(source).sort();
  for (const f of masters()) if (!have.includes(f)) found.push(`missing master ${f}`);
  for (const f of have) if (!masters().includes(f)) found.push(`extra master ${f}`);
  for (const f of have.filter((f) => masters().includes(f))) {
    const size = webpSize(readFileSync(join(source, f)));
    const { side } = WHEEL_ART[f.replace(/\.webp$/, "") as WheelLayer];
    if (!size) found.push(`master ${f}: not a WebP`);
    else if (size.width !== side || size.height !== side) found.push(`master ${f}: ${size.width}x${size.height}, not ${side}x${side}`);
  }
  const copies = walk(out).sort();
  for (const f of expected()) if (!copies.includes(f)) found.push(`missing ${f}`);
  for (const f of copies) if (!expected().includes(f)) found.push(`extra ${f}`);
  for (const f of copies.filter((f) => expected().includes(f))) {
    const want = Number(f.split("/")[1]!.replace(/\.webp$/, ""));
    const got = webpSize(readFileSync(join(out, f)));
    if (!got) found.push(`${f}: not a WebP`);
    else if (got.width !== want || got.height !== want) found.push(`${f}: ${got.width}x${got.height}, not ${want}x${want}`);
  }
  return found;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--check")) {
    const found = problems();
    if (found.length > 0) {
      console.error(found.map((p) => `  - ${p}`).join("\n"));
      process.exit(1);
    }
    console.log(`public/wheel-art/ holds the ${expected().length} copies, each a WebP of its size.`);
  } else {
    rmSync(OUT, { recursive: true, force: true });
    for (const layer of LAYERS) {
      const path = join(SOURCE, `${layer}.webp`);
      const after: string[] = [];
      for (const size of WHEEL_ART[layer].sizes) {
        mkdirSync(join(OUT, layer), { recursive: true });
        const out = join(OUT, layer, `${size}.webp`);
        const args = ["-n", "10", "cwebp", "-quiet", "-metadata", "none", "-m", "6", "-sharp_yuv", "-alpha_q", "100", "-q", String(QUALITY[layer]), "-resize", String(size), String(size), path, "-o", out];
        execFileSync("nice", args, { stdio: "inherit" });
        after.push(`${size} px ${kib(statSync(out).size)}`);
      }
      console.log(`${layer}: master ${kib(statSync(path).size)}; ${after.join(", ")}`);
    }
  }
}
