/**
 * TOKEN-ART: the balances' images, WebP copies of the masters in `token-sources/`.
 *
 *   node scripts/compress-token-art.ts [--check]
 *
 * Reads `token-sources/<kind>.webp` (`TOKEN_ART` in `src/components/elements/token-art.ts`: each currency's icon on one square frame
 * of 512 px) and `token-sources/plate/<part>.webp` (`PLATE_ART`: the balance plate's left cap, tile and right cap, one height),
 * transparent lossless WebP left untouched and never shipped (not in `public/`), and writes `public/token-art/<kind>/<size>.webp` and
 * `public/token-art/plate/<part>/<size>.webp` for each size. Each run removes the copies of an earlier one. `--check` encodes nothing
 * and fails when a master is missing, extra or not of its frame, or a copy is missing, extra, not a WebP, or not of its size.
 *
 * The masters were art-directed and generated with OpenAI's image model through the Codex CLI (`codex exec -c
 * model_provider='"openai"'`), each step approved by the owner on 2026-11-01: three directions, A chosen (`docs/design/balances.webp`),
 * then each asset generated again alone from its cell: PAVED's coin first, vPAVED and USDC's from it (the same coin in silver, and
 * with a silver rim and a blank blue face), the Cobbles' stone with the badge ring's stones as its reference, and the empty plate,
 * cut into its caps and a tile that repeats with no seam. USDC's mark is Circle's, never generated: the white paths of the previous
 * `usdc.svg` (nums', see the notices), rasterised and laid on the coin's face along the face's ellipse (an affine map, the tilted
 * coin's foreshortening), its dark blue emboss under it. The plate's stone and slate and the stone's tone were matched to the badge's
 * (per channel, Pillow and NumPy). Stored as lossless WebP (`cwebp -lossless -z 9 -exact`), the icons scaled to 512 px.
 *
 * Per copy: resized and encoded as lossy WebP with its alpha (`cwebp`, `-m 6 -sharp_yuv`, no metadata) at the quality of `IMAGES`,
 * under `nice -n 10`. No package: `cwebp` is libwebp's command-line tool (`brew install webp`, `apt install webp`), needed only to
 * write. Node 24 runs this as is (type stripping): the syntax stays erasable.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLATE_ART, TOKEN_ART, type PlatePart } from "../src/components/elements/token-art.ts";
import { webpSize } from "./compress-music-art.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCE = resolve(HERE, "../token-sources");
export const OUT = resolve(HERE, "../public/token-art");

/** Each image as `<name>` with its frame and its quality: the icons carry the detail of a coin's face at 16 px. */
const IMAGES = [
  ...Object.entries(TOKEN_ART).map(([kind, frame]) => ({ name: kind, frame, quality: 86 })),
  ...(Object.keys(PLATE_ART) as PlatePart[]).map((part) => ({ name: `plate/${part}`, frame: PLATE_ART[part], quality: 84 })),
];

/** A copy's width and height in pixels, `size` on its frame's side. */
function copySize(frame: (typeof IMAGES)[number]["frame"], size: number): { width: number; height: number } {
  return frame.side === "width"
    ? { width: size, height: Math.round((size * frame.height) / frame.width) }
    : { width: Math.round((size * frame.width) / frame.height), height: size };
}

/** The masters a run reads, as `<name>.webp`. */
export const masters = () => IMAGES.map((i) => `${i.name}.webp`).sort();

/** The files a run writes, as `<name>/<size>.webp`. */
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
    console.log(`public/token-art/ holds the ${expected().length} copies, each a WebP of its size.`);
  } else {
    rmSync(OUT, { recursive: true, force: true });
    for (const image of IMAGES) {
      const path = join(SOURCE, `${image.name}.webp`);
      const after: string[] = [];
      for (const size of image.frame.sizes) {
        mkdirSync(join(OUT, image.name), { recursive: true });
        const out = join(OUT, image.name, `${size}.webp`);
        const { width, height } = copySize(image.frame, size);
        const args = ["-n", "10", "cwebp", "-quiet", "-metadata", "none", "-m", "6", "-sharp_yuv", "-alpha_q", "100", "-q", String(image.quality), "-resize", String(width), String(height), path, "-o", out];
        execFileSync("nice", args, { stdio: "inherit" });
        after.push(`${size} px ${kib(statSync(out).size)}`);
      }
      console.log(`${image.name}: master ${kib(statSync(path).size)}; ${after.join(", ")}`);
    }
  }
}
