/**
 * LEAGUE-ART (#917): the leagues' standards, WebP copies of the masters in `league-sources/`.
 *
 *   node scripts/compress-league-art.ts [--check]
 *
 * Reads `league-sources/<part>/<name>.webp`, one transparent lossless WebP per part (crest, icon, plate, banner), tier and version (the crest's
 * and the icon's plain version and one per division, `bronze-ii`: `artName`), each on its part's frame (`LEAGUE_ART` in
 * `src/components/elements/league-standards.ts`), left untouched and never shipped (not in `public/`), and writes
 * `public/league-art/<part>/<size>/<name>.webp` for each size of the part. Each run removes the copies of an earlier one.
 * `--check` encodes nothing and fails when a master is missing, extra or not of its frame, or a copy is missing, extra, not a
 * WebP, or not of its size: the bytes depend on the encoder's build, which nothing in the repository pins, so they are not compared.
 *
 * The masters were generated with OpenAI's image model through the Codex CLI, after the owner's design
 * (`docs/design/league-standards.webp`): per tier, a sheet of the crest's four versions, one of the icon's, and one of the blank
 * plate and the banner, each on a transparent background, cut apart, the glow around the parts cleared, each shield stretched across
 * to be as wide as it is tall (the owner's 1:1, 2026-10-30), scaled onto the frames, and stored as lossless WebP (`cwebp -lossless
 * -z 9 -exact`): about 18 MiB for the 100 masters, where PNG took 33.
 *
 * Per copy: resized on the part's side and encoded as lossy WebP with its alpha (`cwebp`, libwebp 1.6.0 when these were written,
 * `-m 6 -sharp_yuv -alpha_q 100`, no metadata) at the quality of `QUALITY`. The encoder runs under `nice -n 10`. No package:
 * `cwebp` is libwebp's command-line tool (`brew install webp`, `apt install webp`), needed only to write. Node 24 runs this as is
 * (type stripping): the syntax stays erasable.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LEAGUE_ART, LEAGUE_TIERS, artName, artSize, versionsOf, type LeaguePart } from "../src/components/elements/league-standards.ts";
import { webpSize } from "./compress-music-art.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCE = resolve(HERE, "../league-sources");
export const OUT = resolve(HERE, "../public/league-art");

const PARTS = Object.keys(LEAGUE_ART) as LeaguePart[];

/** The quality per part: the plate's name is drawn over it and the icon is seen small, so neither needs more. */
const QUALITY: Record<LeaguePart, number> = { crest: 80, icon: 82, plate: 78, banner: 78 };

/** Each part's file names: every tier's, in each of the part's versions (`bronze`, `bronze-i`, ...). */
const names = (part: LeaguePart) => LEAGUE_TIERS.flatMap((t) => versionsOf(part).map((v) => artName(t.id, v)));

/** The masters a run reads, as `<part>/<name>.webp`. */
export const masters = () => PARTS.flatMap((part) => names(part).map((n) => `${part}/${n}.webp`)).sort();

/** The files a run writes, as `<part>/<size>/<name>.webp`. */
export const expected = () => PARTS.flatMap((part) => LEAGUE_ART[part].sizes.flatMap((size) => names(part).map((n) => `${part}/${size}/${n}.webp`))).sort();

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
    const frame = LEAGUE_ART[f.split("/")[0] as LeaguePart];
    if (!size) found.push(`master ${f}: not a WebP`);
    else if (size.width !== frame.width || size.height !== frame.height) found.push(`master ${f}: ${size.width}x${size.height}, not ${frame.width}x${frame.height}`);
  }
  const copies = walk(out).sort();
  for (const f of expected()) if (!copies.includes(f)) found.push(`missing ${f}`);
  for (const f of copies) if (!expected().includes(f)) found.push(`extra ${f}`);
  for (const f of copies.filter((f) => expected().includes(f))) {
    const [part, size] = f.split("/");
    const want = artSize(part as LeaguePart, Number(size));
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
    console.log(`public/league-art/ holds the ${expected().length} copies, each a WebP of its size.`);
  } else {
    rmSync(OUT, { recursive: true, force: true });
    for (const part of PARTS) {
      let before = 0;
      const after = new Map<number, number>();
      for (const id of names(part)) {
        const path = join(SOURCE, part, `${id}.webp`);
        before += statSync(path).size;
        for (const size of LEAGUE_ART[part].sizes) {
          const { width, height } = artSize(part, size);
          mkdirSync(join(OUT, part, String(size)), { recursive: true });
          const out = join(OUT, part, String(size), `${id}.webp`);
          const args = ["-n", "10", "cwebp", "-quiet", "-metadata", "none", "-m", "6", "-sharp_yuv", "-alpha_q", "100", "-q", String(QUALITY[part]), "-resize", String(width), String(height), path, "-o", out];
          execFileSync("nice", args, { stdio: "inherit" });
          after.set(size, (after.get(size) ?? 0) + statSync(out).size);
        }
      }
      console.log(`${part}: masters ${kib(before)}; ${[...after].map(([size, total]) => `${size} px ${kib(total)}`).join(", ")} (${names(part).length} each)`);
    }
  }
}
