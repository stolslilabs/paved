/**
 * CHEST-ART: the chests' images, WebP copies of the masters in `chest-sources/`.
 *
 *   node scripts/compress-chest-art.ts [--check]
 *
 * Reads `chest-sources/<rank>/<layer>.webp` (`CHEST_LAYERS` in `src/components/elements/chest-images.ts`: the closed chest, the
 * raised lid and the body on one square frame of 800 px, the icon on its 560 by 448 frame) and `chest-sources/fx/<effect>.webp`
 * (`CHEST_EFFECTS`: the rays, the sparkle, the dust puff), transparent lossless WebP left untouched and never shipped (not in
 * `public/`), and writes `public/chest-art/<rank>/<layer>/<size>.webp` and `public/chest-art/fx/<effect>/<size>.webp` for each size.
 * Each run removes the copies of an earlier one. `--check` encodes nothing and fails when a master is missing, extra or not of its
 * frame, or a copy is missing, extra, not a WebP, or not of its size.
 *
 * The masters were art-directed and generated with OpenAI's image model through the Codex CLI (`codex exec -c
 * model_provider='"openai"'`), each step approved by the owner on 2026-10-31: one sheet of the three ranks (closed, open, icon) and
 * the effects (`docs/design/chests.webp`), then each asset generated again alone from its cell, the open chest from its closed one
 * (same body, same camera, the lid swung up on its hinges), aligned on the closed chest's body, and cut in two along the body's
 * back rim with exact masks (Pillow, NumPy), so the lid then the body give the open chest back. The rays and the sparkle are white
 * with their light as alpha (from black), so the client tints them. Stored as lossless WebP (`cwebp -lossless -z 9 -exact`).
 *
 * Per copy: resized and encoded as lossy WebP with its alpha (`cwebp`, `-m 6 -sharp_yuv`, no metadata) at the quality and the
 * alpha quality of `IMAGES`, under `nice -n 10`. No package: `cwebp` is libwebp's command-line tool (`brew install webp`, `apt install webp`),
 * needed only to write. Node 24 runs this as is (type stripping): the syntax stays erasable.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHEST_EFFECTS, CHEST_LAYERS, CHEST_MEASURES, type ChestEffect, type ChestLayer } from "../src/components/elements/chest-images.ts";
import { webpSize } from "./compress-music-art.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCE = resolve(HERE, "../chest-sources");
export const OUT = resolve(HERE, "../public/chest-art");

const RANKS = Object.keys(CHEST_MEASURES);
const LAYERS = Object.keys(CHEST_LAYERS) as ChestLayer[];
const EFFECTS = Object.keys(CHEST_EFFECTS) as ChestEffect[];

/**
 * Each image as `<folder>/<name>` with its frame, its quality and its alpha's: the painted chests carry the detail and keep their
 * edges exact; the rays are light alone, a soft gradient in their alpha that a lossy alpha keeps for a third of the weight.
 */
const IMAGES = [
  ...RANKS.flatMap((rank) => LAYERS.map((layer) => ({ name: `${rank}/${layer}`, frame: CHEST_LAYERS[layer], quality: layer === "icon" ? 86 : 84, alpha: 100 }))),
  ...EFFECTS.map((effect) => ({ name: `fx/${effect}`, frame: CHEST_EFFECTS[effect], quality: effect === "rays" ? 70 : effect === "sparkle" ? 84 : 80, alpha: effect === "rays" ? 60 : 100 })),
];

/** A copy's width and height in pixels, `size` on its frame's side. */
function copySize(frame: (typeof IMAGES)[number]["frame"], size: number): { width: number; height: number } {
  return frame.side === "width"
    ? { width: size, height: Math.round((size * frame.height) / frame.width) }
    : { width: Math.round((size * frame.width) / frame.height), height: size };
}

/** The masters a run reads, as `<folder>/<name>.webp`. */
export const masters = () => IMAGES.map((i) => `${i.name}.webp`).sort();

/** The files a run writes, as `<folder>/<name>/<size>.webp`. */
export const expected = () => IMAGES.flatMap((i) => i.frame.sizes.map((size) => `${i.name}/${size}.webp`)).sort();

const walk = (dir: string, base = dir): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n), base) : [join(dir, n).slice(base.length + 1)]));

const kib = (n: number) => `${(n / 1024).toFixed(1)} KiB`;

/** What is wrong with the masters and the copies, if anything. */
export function problems(source = SOURCE, out = OUT): string[] {
  const found: string[] = [];
  const have = walk(source).sort();
  for (const f of masters()) if (!have.includes(f)) found.push(`missing master ${f}`);
  for (const f of have) if (!masters().includes(f)) found.push(`extra master ${f}`);
  for (const image of IMAGES.filter((i) => have.includes(`${i.name}.webp`))) {
    const size = webpSize(readFileSync(join(source, `${image.name}.webp`)));
    const { width, height } = image.frame;
    if (!size) found.push(`master ${image.name}.webp: not a WebP`);
    else if (size.width !== width || size.height !== height) found.push(`master ${image.name}.webp: ${size.width}x${size.height}, not ${width}x${height}`);
  }
  const copies = walk(out).sort();
  for (const f of expected()) if (!copies.includes(f)) found.push(`missing ${f}`);
  for (const f of copies) if (!expected().includes(f)) found.push(`extra ${f}`);
  for (const f of copies.filter((f) => expected().includes(f))) {
    const name = f.slice(0, f.lastIndexOf("/"));
    const want = copySize(IMAGES.find((i) => i.name === name)!.frame, Number(f.slice(f.lastIndexOf("/") + 1).replace(/\.webp$/, "")));
    const got = webpSize(readFileSync(join(out, f)));
    if (!got) found.push(`${f}: not a WebP`);
    else if (got.width !== want.width || got.height !== want.height) found.push(`${f}: ${got.width}x${got.height}, not ${want.width}x${want.height}`);
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
    console.log(`public/chest-art/ holds the ${expected().length} copies, each a WebP of its size.`);
  } else {
    rmSync(OUT, { recursive: true, force: true });
    for (const image of IMAGES) {
      const path = join(SOURCE, `${image.name}.webp`);
      const after: string[] = [];
      for (const size of image.frame.sizes) {
        mkdirSync(join(OUT, image.name), { recursive: true });
        const out = join(OUT, image.name, `${size}.webp`);
        const { width, height } = copySize(image.frame, size);
        const args = ["-n", "10", "cwebp", "-quiet", "-metadata", "none", "-m", "6", "-sharp_yuv", "-alpha_q", String(image.alpha), "-q", String(image.quality), "-resize", String(width), String(height), path, "-o", out];
        execFileSync("nice", args, { stdio: "inherit" });
        after.push(`${size} px ${kib(statSync(out).size)}`);
      }
      console.log(`${image.name}: master ${kib(statSync(path).size)}; ${after.join(", ")}`);
    }
  }
}
