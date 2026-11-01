/**
 * UI-ART: the HUD's icons and frames, WebP copies of the masters in `ui-sources/`.
 *
 *   node scripts/compress-ui-art.ts [--check]
 *
 * Reads `ui-sources/icons/<name>.webp` (`UI_ICONS`, each on `ICON_FRAME`) and `ui-sources/frames/<name>.webp` (`FRAME_ART`), in
 * `src/components/elements/ui-art.ts`, transparent lossless WebP left untouched and never shipped (not in `public/`), and writes
 * `public/ui-art/icons/<size>/<name>.webp` and `public/ui-art/frames/<size>/<name>.webp` for each size. Each run removes the copies
 * of an earlier one. `--check` encodes nothing and fails when a master is missing, extra or not of its frame, or a copy is missing,
 * extra, not a WebP, or not of its size: the bytes depend on the encoder's build, which nothing in the repository pins, so they are
 * not compared.
 *
 * The masters were generated with OpenAI's image model through the Codex CLI after the owner's mobile direction of 2026-11-01
 * (`docs/design/home.webp`, each step approved by the owner): sheets of 16 icons and one of the frames, drawn on a transparent
 * background by editing the validated screens, so every asset is copied from them; then cut by script, each icon trimmed to its
 * drawing, fitted to a 240 px box (its proportions kept) and centred on a 256 px square, each frame put on its own frame. The
 * ribbon was drawn again with straight rims (no notches, so its stretched middle does not show) and the medallion with a round rim.
 * Stored as lossless WebP (`cwebp -lossless -z 9 -exact`).
 *
 * Per copy: resized on its frame's side and encoded as lossy WebP with its alpha (`cwebp`, `-m 6 -sharp_yuv -alpha_q 100`, no
 * metadata) at the quality of `QUALITY`, under `nice -n 10`. No package: `cwebp` is libwebp's command-line tool (`brew install
 * webp`, `apt install webp`), needed only to write. Node 24 runs this as is (type stripping): the syntax stays erasable.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FRAME_ART, ICON_FRAME, UI_FRAMES, UI_ICONS, copySize } from "../src/components/elements/ui-art.ts";
import { webpSize } from "./compress-music-art.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCE = resolve(HERE, "../ui-sources");
export const OUT = resolve(HERE, "../public/ui-art");

/** Each image as `<kind>/<name>` with its frame and its quality: the icons are seen small, the ribbon is mostly parchment. */
const QUALITY = { icons: 82, frames: 80 } as const;
const IMAGES = [
  ...UI_ICONS.map((name) => ({ kind: "icons" as const, name, frame: ICON_FRAME })),
  ...UI_FRAMES.map((name) => ({ kind: "frames" as const, name, frame: FRAME_ART[name] })),
];

/** The masters a run reads, as `<kind>/<name>.webp`. */
export const masters = () => IMAGES.map((i) => `${i.kind}/${i.name}.webp`).sort();

/** The files a run writes, as `<kind>/<size>/<name>.webp`. */
export const expected = () => IMAGES.flatMap((i) => i.frame.sizes.map((size) => `${i.kind}/${size}/${i.name}.webp`)).sort();

const walk = (dir: string, base = dir): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n), base) : [join(dir, n).slice(base.length + 1)]));

const kib = (n: number) => `${(n / 1024).toFixed(1)} KiB`;

/** What is wrong with the masters and the copies, if anything. */
export function problems(source = SOURCE, out = OUT): string[] {
  const found: string[] = [];
  const have = walk(source).sort();
  for (const f of masters()) if (!have.includes(f)) found.push(`missing master ${f}`);
  for (const f of have) if (!masters().includes(f)) found.push(`extra master ${f}`);
  for (const image of IMAGES) {
    const f = `${image.kind}/${image.name}.webp`;
    if (!have.includes(f)) continue;
    const size = webpSize(readFileSync(join(source, f)));
    if (!size) found.push(`master ${f}: not a WebP`);
    else if (size.width !== image.frame.width || size.height !== image.frame.height) found.push(`master ${f}: ${size.width}x${size.height}, not ${image.frame.width}x${image.frame.height}`);
  }
  const copies = walk(out).sort();
  for (const f of expected()) if (!copies.includes(f)) found.push(`missing ${f}`);
  for (const f of copies) if (!expected().includes(f)) found.push(`extra ${f}`);
  for (const image of IMAGES)
    for (const s of image.frame.sizes) {
      const f = `${image.kind}/${s}/${image.name}.webp`;
      if (!copies.includes(f)) continue;
      const want = copySize(image.frame, s);
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
    console.log(`public/ui-art/ holds the ${expected().length} copies, each a WebP of its size.`);
  } else {
    rmSync(OUT, { recursive: true, force: true });
    for (const kind of ["icons", "frames"] as const) {
      let before = 0;
      const after = new Map<number, number>();
      const images = IMAGES.filter((i) => i.kind === kind);
      for (const image of images) {
        const path = join(SOURCE, kind, `${image.name}.webp`);
        before += statSync(path).size;
        for (const size of image.frame.sizes) {
          const { width, height } = copySize(image.frame, size);
          mkdirSync(join(OUT, kind, String(size)), { recursive: true });
          const out = join(OUT, kind, String(size), `${image.name}.webp`);
          const args = ["-n", "10", "cwebp", "-quiet", "-metadata", "none", "-m", "6", "-sharp_yuv", "-alpha_q", "100", "-q", String(QUALITY[kind]), "-resize", String(width), String(height), path, "-o", out];
          execFileSync("nice", args, { stdio: "inherit" });
          after.set(size, (after.get(size) ?? 0) + statSync(out).size);
        }
      }
      console.log(`${kind}: masters ${kib(before)}; ${[...after].map(([size, total]) => `${size} px ${kib(total)}`).join(", ")} (${images.length})`);
    }
  }
}
