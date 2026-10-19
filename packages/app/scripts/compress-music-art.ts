/**
 * MUSIC-PLAYER (#569): the tracks' images, small square WebP copies of the originals in `music-sources/`.
 *
 *   node scripts/compress-music-art.ts [--check]
 *
 * Reads `music-sources/<nn> - <Title>.jpeg` (and `00-endless-kingdom.png`), left untouched and never shipped (not in `public/`,
 * and not in `asset-sources/`, which the Storybook serves whole), and writes
 * `public/music-art/<size>/<track>.webp` for each size of `ART_SIZES` (`src/lib/music/track-info.ts`), named after the track
 * (`03-market-day.webp`): the source's number picks the track. Each run removes the copies of an earlier one. `--check`
 * encodes nothing and fails when a copy is missing, extra, not a WebP, or not of its size: the bytes depend on the encoder's
 * build, which nothing in the repository pins, so they are not compared.
 *
 * Per image: the largest centred square, resized to the size and encoded as lossy WebP (`cwebp`, libwebp 1.6.0 when these were
 * written, `-m 6 -sharp_yuv`, no metadata) at the quality of `QUALITY`. WebP, not AVIF: Safari reads it from iOS 14, the
 * lock screen takes it, and at these sizes AVIF saved little. The encoder runs under `nice -n 10`. No package: `cwebp` is
 * libwebp's command-line tool (`brew install webp`, `apt install webp`), needed only to write. Node 24 runs this as is (type
 * stripping): the syntax stays erasable.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ART_SIZES, TRACK_LIST } from "../src/lib/music/track-info.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCE = resolve(HERE, "../music-sources");
export const OUT = resolve(HERE, "../public/music-art");

/** The quality per size: the thumbnail is seen at 64 px, so a lower quality does not show; the lock screen's is larger. */
const QUALITY: Record<number, number> = { 128: 72, 512: 62 };

/** The width and height of a JPEG (its first frame header) or a PNG (IHDR). */
export function imageSize(bytes: Uint8Array): { width: number; height: number } {
  const b = Buffer.from(bytes);
  if (b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error("not a JPEG or a PNG");
  let at = 2;
  while (at < b.length) {
    if (b[at] !== 0xff) throw new Error("bad JPEG marker");
    const marker = b[at + 1]!;
    const length = b.readUInt16BE(at + 2);
    // SOF0 to SOF15, but DHT (c4), JPG (c8) and DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: b.readUInt16BE(at + 7), height: b.readUInt16BE(at + 5) };
    at += 2 + length;
  }
  throw new Error("no JPEG frame header");
}

/** The width and height of a WebP (lossy `VP8 `, lossless `VP8L` or extended `VP8X`), or null when the bytes are not one. */
export function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  const b = Buffer.from(bytes);
  if (b.length < 30 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  return null;
}

/** Each source with the track it belongs to, by its number; every track must have one. */
export function sources(dir = SOURCE): { file: string; track: string }[] {
  const byNumber = new Map(readdirSync(dir).filter((n) => /\.(jpe?g|png)$/i.test(n)).map((n) => [n.slice(0, 2), n]));
  return TRACK_LIST.map(([track]) => {
    const file = byNumber.get(track.slice(0, 2));
    if (!file) throw new Error(`${track}: no image in ${dir}`);
    return { file, track };
  });
}

/** The files a run writes, as `<size>/<track>.webp`. */
export const expected = () => ART_SIZES.flatMap((size) => TRACK_LIST.map(([track]) => `${size}/${track}.webp`)).sort();

const written = () =>
  readdirSync(OUT)
    .filter((d) => statSync(join(OUT, d)).isDirectory())
    .flatMap((d) => readdirSync(join(OUT, d)).map((n) => `${d}/${n}`))
    .sort();

const kib = (n: number) => `${(n / 1024).toFixed(1)} KiB`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  const list = sources();
  if (check) {
    const problems: string[] = [];
    const have = written();
    for (const f of expected()) if (!have.includes(f)) problems.push(`missing ${f}`);
    for (const f of have) if (!expected().includes(f)) problems.push(`extra ${f}`);
    for (const f of have.filter((f) => expected().includes(f))) {
      const size = Number(f.split("/")[0]);
      const got = webpSize(readFileSync(join(OUT, f)));
      if (!got) problems.push(`${f}: not a WebP`);
      else if (got.width !== size || got.height !== size) problems.push(`${f}: ${got.width}x${got.height}, not ${size}x${size}`);
    }
    if (problems.length > 0) {
      console.error(problems.map((p) => `  - ${p}`).join("\n"));
      process.exit(1);
    }
    console.log(`public/music-art/ holds the ${have.length} copies, each a WebP of its size.`);
  } else {
    rmSync(OUT, { recursive: true, force: true });
    let before = 0;
    const after = new Map<number, number>();
    for (const { file, track } of list) {
      const path = join(SOURCE, file);
      const bytes = readFileSync(path);
      before += bytes.length;
      const { width, height } = imageSize(bytes);
      const side = Math.min(width, height);
      const x = Math.floor((width - side) / 2);
      const y = Math.floor((height - side) / 2);
      for (const size of ART_SIZES) {
        mkdirSync(join(OUT, String(size)), { recursive: true });
        const out = join(OUT, String(size), `${track}.webp`);
        const args = ["-n", "10", "cwebp", "-quiet", "-metadata", "none", "-m", "6", "-sharp_yuv", "-q", String(QUALITY[size] ?? 75), "-crop", String(x), String(y), String(side), String(side), "-resize", String(size), String(size), path, "-o", out];
        execFileSync("nice", args, { stdio: "inherit" });
        after.set(size, (after.get(size) ?? 0) + statSync(out).size);
      }
    }
    console.log(`originals: ${list.length} files, ${kib(before)} (music-sources/, not shipped)`);
    for (const [size, total] of after) console.log(`${size} px: ${list.length} files, ${kib(total)}`);
  }
}
