/**
 * PLAYER-BADGE: the player badge's parts, WebP copies of the masters in `badge-sources/`.
 *
 *   node scripts/compress-badge-art.ts [--check]
 *
 * Reads `badge-sources/<part>.webp`, one transparent lossless WebP per part (ring, bar, shield, plate-tile, plate-cap), each on its
 * part's frame (`BADGE_ART` in `src/components/elements/badge-art.ts`), left untouched and never shipped (not in `public/`), and
 * writes `public/badge-art/<part>/<size>.webp` for each size of the part. Each run removes the copies of an earlier one. `--check`
 * encodes nothing and fails when a master is missing, extra or not of its frame, or a copy is missing, extra, not a WebP, or not
 * of its size.
 *
 * The masters were generated with OpenAI's image model through the Codex CLI, after the owner's starting image and the target the
 * owner's direction settled on (`docs/design/player-badge.webp`): the ring (its centre keyed out of a flat magenta), the shield and
 * the plate each on a transparent background; the bar's glow drawn on black, made into alpha, and wrapped round the groove's
 * middle; the ring centred on its hole; the plate cut joint to joint into a tile of two bricks (its face's ends faded into each
 * other, so it repeats with no seam) and its cap, its bricks toned to the ring's stones. Stored as lossless WebP (`cwebp -lossless
 * -z 9 -exact`).
 *
 * Per copy: resized on the part's side and encoded as lossy WebP with its alpha (`cwebp`, `-m 6 -sharp_yuv -alpha_q 100`, no
 * metadata) at the quality of `QUALITY`, under `nice -n 10`. No package: `cwebp` is libwebp's command-line tool (`brew install
 * webp`, `apt install webp`), needed only to write. Node 24 runs this as is (type stripping): the syntax stays erasable.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BADGE_ART, badgeArtSize, type BadgePart } from "../src/components/elements/badge-art.ts";
import { webpSize } from "./compress-music-art.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCE = resolve(HERE, "../badge-sources");
export const OUT = resolve(HERE, "../public/badge-art");

const PARTS = Object.keys(BADGE_ART) as BadgePart[];

/** The quality per part: the bar is a glow and the plate is seen small, so neither needs more. */
const QUALITY: Record<BadgePart, number> = { ring: 82, bar: 80, shield: 84, "plate-tile": 80, "plate-cap": 82 };

/** The masters a run reads, as `<part>.webp`. */
export const masters = () => PARTS.map((part) => `${part}.webp`).sort();

/** The files a run writes, as `<part>/<size>.webp`. */
export const expected = () => PARTS.flatMap((part) => BADGE_ART[part].sizes.map((size) => `${part}/${size}.webp`)).sort();

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
    const frame = BADGE_ART[f.replace(/\.webp$/, "") as BadgePart];
    if (!size) found.push(`master ${f}: not a WebP`);
    else if (size.width !== frame.width || size.height !== frame.height) found.push(`master ${f}: ${size.width}x${size.height}, not ${frame.width}x${frame.height}`);
  }
  const copies = walk(out).sort();
  for (const f of expected()) if (!copies.includes(f)) found.push(`missing ${f}`);
  for (const f of copies) if (!expected().includes(f)) found.push(`extra ${f}`);
  for (const f of copies.filter((f) => expected().includes(f))) {
    const [part, file] = f.split("/");
    const want = badgeArtSize(part as BadgePart, Number(file!.replace(/\.webp$/, "")));
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
    console.log(`public/badge-art/ holds the ${expected().length} copies, each a WebP of its size.`);
  } else {
    rmSync(OUT, { recursive: true, force: true });
    for (const part of PARTS) {
      const path = join(SOURCE, `${part}.webp`);
      const after: string[] = [];
      for (const size of BADGE_ART[part].sizes) {
        const { width, height } = badgeArtSize(part, size);
        mkdirSync(join(OUT, part), { recursive: true });
        const out = join(OUT, part, `${size}.webp`);
        const args = ["-n", "10", "cwebp", "-quiet", "-metadata", "none", "-m", "6", "-sharp_yuv", "-alpha_q", "100", "-q", String(QUALITY[part]), "-resize", String(width), String(height), path, "-o", out];
        execFileSync("nice", args, { stdio: "inherit" });
        after.push(`${size} px ${kib(statSync(out).size)}`);
      }
      console.log(`${part}: master ${kib(statSync(path).size)}; ${after.join(", ")}`);
    }
  }
}
