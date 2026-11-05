/**
 * UI-ART: the HUD's icons and frames, WebP copies of the masters in `ui-sources/`.
 *
 *   node scripts/compress-ui-art.ts [--check]
 *
 * Reads `ui-sources/icons/<name>.webp` (`UI_ICONS`, each on `ICON_FRAME`) and `ui-sources/frames/<name>.webp` (`FRAME_ART`), in
 * `src/components/elements/ui-art.ts`, `ui-sources/medallions/<name>.webp` (`UI_MEDALLIONS` and `UI_RINGS`, on `MEDALLION_FRAME`, in
 * `medallion-art.ts`), `ui-sources/missions/<name>.webp` (`MISSION_PARTS`, there too) and `ui-sources/shop/<name>.webp` (`SHOP_PARTS`,
 * in `shop-art.ts`), transparent lossless WebP left untouched
 * and never shipped (not in `public/`), and writes
 * `public/ui-art/icons/<size>/<name>.webp` and `public/ui-art/frames/<size>/<name>.webp` for each size. Each run removes the copies
 * of an earlier one. `--check` encodes nothing and fails when a master is missing, extra or not of its frame, or a copy is missing,
 * extra, not a WebP, or not of its size: the bytes depend on the encoder's build, which nothing in the repository pins, so they are
 * not compared.
 *
 * The masters were generated with OpenAI's image model through the Codex CLI after the owner's mobile direction of 2026-11-01
 * (`docs/design/home.webp`, each step approved by the owner): sheets of 16 icons and one of the frames, drawn on a transparent
 * background by editing the validated screens, so every asset is copied from them; then cut by script, each icon trimmed to its
 * drawing, fitted to a 240 px box (its proportions kept) and centred on a 256 px square, each frame put on its own frame. The
 * dock's ribbon and divider, the PLAY medallion, the season dial's frame and the game modes' icons left on 2026-11-02, unused once the
 * owner kept the app's layout; the player card's frame (`card-frame`) on 2026-11-03, the HUD's frame being CSS since. The profile
 * drawer's three (Avatar, Collection, Invite, 2026-11-02) were redrawn one by one from crops of the profile's mockup, on a
 * flat magenta keyed out by script, then put on the same frame (its Disconnect left with the profile's on 2026-11-04). The four
 * structures and the profile's totals (City, Road, Forest, Wonder, Stats; PROFILE-PAGE, 2026-11-04) were drawn on a transparent
 * background in the rendering of the dock's icons, three-quarters from above, each standing on one shared slab of grass (the Wonder's
 * of stone), checked side by side with the dock's at 44 and 20 points; the four structures cut with one box (the union of their
 * drawings), not each trimmed to its own, so their slabs keep one size and one place on the frame. The Stats stands alone, no slab
 * (the owner's ask), trimmed to its drawing as the dock's icons are. HOME-EDGES (2026-11-04), from the Paved UX Book's main screen
 * (the owner's approved mockups): the mission's hammer, redrawn as an icon and put on the icons' frame; the Chat tab, Codex's redraw
 * of the book's orange tab, alone on a transparent background, then redrawn at its new size (56 x 64 points, the owner's ask) from
 * that first one, its face toned to it by a per-channel gain (the book's blue tile, and three grey directions after it, were set
 * aside: the right column draws no tile). CAMERA-EXPLORE (2026-11-04): the Camera mode's icon, a house on its tile with an arrow in
 * orbit round it, the owner's choice among three Codex drew in the icons' rendering (a spyglass and an eye in a turning arrow the
 * others), alone on a transparent background; its way out, Exit, the same house with a straight arrow going out of it (the owner's
 * choice among three: a door ajar and a U-turn arrow the others). The dock's four (wood, panel, divider, medallion; HOME-DOCK,
 * 2026-11-03) were cut from the mockup's footer at 3x: Codex redrew each layer alone at the footer's framing on a flat magenta,
 * keyed out by script; each layer was registered on the mockup (scale and shift by least error, the parchment fitted box by box),
 * their restack checked against the mockup side by side, then each piece cropped (the panel's divider painted out with the
 * parchment beside it, the divider kept alone, the medallion's face toned to the mockup's by a fitted gradient). Stored as lossless
 * WebP (`cwebp -lossless -z 9 -exact`).
 *
 * MISSIONS-PAGE (2026-11-04): the missions' medallion paintings, after the owner's ask (the book's images, not the HUD's icons):
 * fourteen faces cropped from the Paved UX Book's Missions screens, each redrawn by Codex at 1024 px without its ring or its badge
 * (the book's locked ones in colour), nine more painted by Codex in their rendering for the missions the book does not draw; each
 * checked side by side with its crop of the book (the helmet, its ground not the book's, and the road, the handshake and the tower,
 * drawn by no mission, were left out); cut to their disc, transparent outside it, on a 256 px square. Then the book's painted pieces
 * (the owner's choice among a CSS rendering and these): the rings (silver, gold, green; their hole the painting's 78%), the
 * milestones' rail (its steel and its gold) and nodes (the orb, the bead), the waiting gift's halo and the done badge's green check,
 * each extracted alone from the book's Missions screens by Codex, checked side by side with them, trimmed to its opaque box.
 *
 * LEAGUE-PAGE (2026-11-05): the battle logs' Attack badge (the crossed swords on the gold shield) and the season row's calendar with
 * its crown, the Paved UX Book's League's own pixels (Codex's image tool was not available that day: its models listed no
 * `image_gen`): each cropped from the book's phone screen (about 80 px), upscaled 3x, its navy panel keyed out by a flood fill from the
 * crop's edges over the pixels bluer than they are red (the drawing's near-black outline stops it, the ring next to it ramped and
 * darkened to the outline's colour), the largest drawing kept alone (the badge's label under it dropped), checked side by side
 * with the book, then trimmed and put on the icons' frame.
 *
 * SHOP-PAGE (2026-11-05): the themes' marks of the Shop's Themes tab (Forest's leaf, Snow's snowflake, Desert's cactus), the Paved UX
 * Book's Shop's own pixels as the League's (Codex listed no image tool that day): each cropped from the book's phone Themes screen
 * (about 60 px), its navy keyed out the same way, the largest drawing kept, trimmed, upscaled to the 240 px box and put on the icons'
 * frame, checked side by side with the book. Volcano, which the book does not draw, keeps its Font Awesome icon. Then, on the owner's
 * asks of the same day, the Shop's pieces (`ui-sources/shop/`, `SHOP_PARTS`): the rarity pills (grey, green, purple; from the book's
 * tablet Tiles screen) and a pile of stones a Cobble pack (50, 100, 500, 1,000; from its phone Cobbles screen), extracted by Codex
 * from the book's pixels (it listed no image tool: its own script keyed the navy out and decontaminated the edges, dropped the
 * "Popular" label's corner, and rebuilt each pill's middle from a text-free column so the client writes the word), each checked by
 * it and by us beside its crop; the pills kept at their size (their rounded ends measured, `RARITY_END`), the piles at the book's
 * scale on one 256 x 160 frame, their foot 4 px above its bottom.
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
import { MEDALLION_FRAME, MISSION_PARTS, UI_MEDALLIONS, UI_MISSION_PARTS, UI_RINGS } from "../src/components/elements/medallion-art.ts";
import { SHOP_PARTS, UI_SHOP_PARTS } from "../src/components/elements/shop-art.ts";
import { webpSize } from "./compress-music-art.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCE = resolve(HERE, "../ui-sources");
export const OUT = resolve(HERE, "../public/ui-art");

/** Each image as `<kind>/<name>` with its frame and its quality: the icons are seen small, the frames are mostly flat, the medallions are paintings. */
const QUALITY = { icons: 82, frames: 80, medallions: 82, missions: 82, shop: 82 } as const;
const IMAGES = [
  ...UI_ICONS.map((name) => ({ kind: "icons" as const, name, frame: ICON_FRAME })),
  ...UI_FRAMES.map((name) => ({ kind: "frames" as const, name, frame: FRAME_ART[name] })),
  ...[...UI_MEDALLIONS, ...UI_RINGS].map((name) => ({ kind: "medallions" as const, name, frame: MEDALLION_FRAME })),
  ...UI_MISSION_PARTS.map((name) => ({ kind: "missions" as const, name, frame: MISSION_PARTS[name] })),
  ...UI_SHOP_PARTS.map((name) => ({ kind: "shop" as const, name, frame: SHOP_PARTS[name] })),
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
    for (const kind of ["icons", "frames", "medallions", "missions", "shop"] as const) {
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
