/**
 * PAVED's and vPAVED's coins (#853): `src/assets/tokens/paved.svg` (gold) and `vpaved.svg` (silver) are generated from Font Awesome
 * Pro's `coin-front` (`vendor/fontawesome/solid.min.js`), its centre's mark replaced by the "P" of the display font (Almendra Bold, as
 * outlines), in the game icons' relief (#844, `elements/game-icon.tsx`): the thick dark outline, the lit gradient, the light along
 * the upper edges and the shadow under the coin, in the gold and the steel tones of the palette (theme.css, 3f).
 *
 * USDC's coin (#861), `usdc.svg`, is the same coin in a neutral steel, the groove kept and the face taken by the USDC mark
 * (`vendor/usdc/mark.svg`) in its own colours: unaltered, only scaled onto the coin and rounded to its grid. The relief stays on the
 * rim; nothing is drawn over the mark.
 *
 *   node scripts/coins.ts            write the three files
 *   node scripts/coins.ts --check    fail when a committed file differs from what the source gives
 *
 * Node 24 runs it as is (type stripping): the syntax stays erasable. No package.
 * `public/THIRD_PARTY_NOTICES.txt` records `coin-front` as derived and the "P" as Almendra Bold's.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readIcon, ROOT, roundPath, SOURCE, splitPath } from "./game-icons.ts";

export const COIN_PATHS = {
  paved: join(ROOT, "src/assets/tokens/paved.svg"),
  vpaved: join(ROOT, "src/assets/tokens/vpaved.svg"),
  usdc: join(ROOT, "src/assets/tokens/usdc.svg"),
} as const;
export type Coin = keyof typeof COIN_PATHS;

/**
 * The "P" of Almendra Bold (the display font) as outlines, on a 64 grid, centred on (32, 32.5): the letter of the coins since
 * issue 711, kept as is. Only `M`, `L`, `Q` and `Z`, absolute.
 */
const LETTER_P =
  "M15.45 14.66L15.45 13.04L34.04 12.5Q34.22 12.5 34.4 12.5L34.4 12.5Q41.12 12.5 44.83 14.57Q48.55 16.64 48.55 22.28Q48.55 27.91 43.99 31.51Q39.44 35.11 33.44 35.11L33.44 35.11Q32.36 35.11 31.88 35.05L31.88 35.05L32.12 32.29L32.84 32.29Q37.76 32.29 37.76 23.23L37.76 23.23Q37.76 19.58 36.59 17.51Q35.42 15.44 32.42 15.44L32.42 15.44Q31.28 15.44 30.2 15.74L30.2 15.74Q29.6 21.02 29.6 32.62Q29.6 44.22 30.44 49.92L30.44 49.92Q32.78 50.34 34.04 50.94L34.04 50.94L33.86 52.5Q29.54 51.96 24.47 51.96Q19.41 51.96 15.81 52.5L15.81 52.5L15.57 50.88Q16.89 50.16 18.93 49.74L18.93 49.74Q19.71 43.86 19.71 33.43Q19.71 22.99 18.87 15.62L18.87 15.62Q17.31 14.84 15.45 14.66L15.45 14.66Z";

/** The P's height on the coin (the 512 grid): it fills the face (`coin-front`'s inner disc, 320 across) with its outline inside it. */
const P_HEIGHT = 228;

/** The P moved onto the coin's centre and scaled to `P_HEIGHT`, every point rounded to the 512 grid. */
export function letterP(): string {
  const k = P_HEIGHT / 40; // the letter is 40 high (12.5 to 52.5)
  const at = (x: number, y: number) => `${Math.round(256 + (x - 32) * k)} ${Math.round(256 + (y - 32.5) * k)}`;
  const tokens = LETTER_P.match(/[MLQZ]|[\d.]+/g)!;
  let d = "";
  for (let i = 0; i < tokens.length; ) {
    const cmd = tokens[i++]!;
    const n = { M: 2, L: 2, Q: 4, Z: 0 }[cmd as "M" | "L" | "Q" | "Z"];
    const v = tokens.slice(i, i + n).map(Number);
    i += n;
    d += cmd + (n === 4 ? `${at(v[0]!, v[1]!)} ${at(v[2]!, v[3]!)}` : n ? at(v[0]!, v[1]!) : "");
  }
  // Shortened as the game icons' paths (the font's zero-length lines dropped).
  return roundPath(d);
}

/** sRGB hex to OKLab, and back: the palette's `color-mix(in oklab, ...)` (game-icon.tsx `mix`), computed for a file. */
function toLab(hex: string): number[] {
  const lin = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363329296 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function toHex([L, A, B]: number[]): string {
  const l = (L! + 0.3963377774 * A! + 0.2158037573 * B!) ** 3;
  const m = (L! - 0.1055613458 * A! - 0.0638541728 * B!) ** 3;
  const s = (L! - 0.0894841775 * A! - 1.291485548 * B!) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return `#${rgb
    .map((c) => {
      const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")
    .toUpperCase()}`;
}

/** The dark theme's ink and light (theme.css: `--background`, charcoal-950; `--foreground`, charcoal-50): the files are images. */
const INK = "#121316";
const LIGHT = "#F4F1EA";

/** `mix` of game-icon.tsx: the lit top toward the light, the foot and the outline toward the ink. */
function steps(base: string) {
  const at = (share: number, toward: string) => {
    const [a, b] = [toLab(base), toLab(toward)];
    return toHex(a.map((v, i) => (v * share + b[i]! * (100 - share)) / 100));
  };
  return { hi: at(55, LIGHT), mid: base, lo: at(72, INK), edge: at(20, INK) };
}

/**
 * The tones' bases (theme.css, 3f): PAVED the gold (`--game-gold`, gold-300), vPAVED the steel (`--game-steel`, charcoal-200), USDC
 * a step darker, a neutral steel (charcoal-300): close to the silver, so the mark's blue keeps its own place, yet not vPAVED's coin.
 */
export const COIN_BASES: Record<Coin, string> = { paved: "#F0BF5B", vpaved: "#DADBDF", usdc: "#CDCFD4" };

/** The USDC mark as published (nums, a 2000 grid, its disc centred on (1000, 1000)), one `<path fill d>` per part. */
export const USDC_MARK = join(ROOT, "vendor/usdc/mark.svg");

/**
 * The mark's radius on the coin (the 512 grid): inside the groove (192), so a dark ring of it frames the mark as it frames the P's
 * face, and wider than the face (160), so the mark's sign still reads at 16 px.
 */
export const MARK_RADIUS = 176;

/** What each argument of a command is: an x, a y, a radius (scaled, never moved) or a rotation or flag (kept). */
function role(command: string, j: number): "x" | "y" | "r" | "-" {
  if (command === "H") return "x";
  if (command === "V") return "y";
  // An arc's rx, ry, rotation and two flags, then its end point.
  if (command === "A" && j < 5) return j < 2 ? "r" : "-";
  return (command === "A" ? j - 5 : j) % 2 ? "y" : "x";
}

/**
 * A path scaled by `k` and moved by (`dx`, `dy`), unrounded: absolute points are mapped, relative steps and radii only scaled.
 * `roundPath` then rounds it where every point lands, so the error never adds up.
 */
export function scalePath(d: string, k: number, dx: number, dy: number): string {
  const tokens = d.match(/[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) ?? [];
  const n = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 } as Record<string, number>;
  let out = "";
  let cmd = "";
  for (let i = 0; i < tokens.length; ) {
    if (/[a-zA-Z]/.test(tokens[i]!)) {
      cmd = tokens[i++]!;
      out += cmd;
      if (cmd.toUpperCase() === "Z") continue;
    } else out += " ";
    const up = cmd.toUpperCase();
    // A path's first `m` is absolute (the spec): the mark's arcs start so.
    const rel = cmd !== up && out.length > 1;
    const values = tokens.slice(i, i + n[up]!).map(Number);
    i += n[up]!;
    out += values
      .map((v, j) => {
        const r = role(up, j);
        if (r === "-") return v;
        if (r === "r" || rel) return v * k;
        return v * k + (r === "x" ? dx : dy);
      })
      .join(" ");
    // A moveto's repeats are linetos, relative after any `m` (the first one included).
    if (up === "M") cmd = cmd === "m" ? "l" : "L";
  }
  return out;
}

/**
 * The mark's parts, scaled onto the coin's face and rounded to its grid (0.06 px at 64 px): their fills and shapes unchanged. The
 * parts of one colour (the sign and its arcs, which do not touch) go in one path, the same drawing in fewer bytes.
 */
export function usdcMark(mark: string = readFileSync(USDC_MARK, "utf8")): string {
  const k = MARK_RADIUS / 1000;
  const parts = [...mark.matchAll(/<path fill="(#[0-9A-Fa-f]{6})" d="([^"]+)"\/>/g)];
  if (parts.length !== 3) throw new Error(`${USDC_MARK}: ${parts.length} paths, the mark has three (its disc and its sign's two parts)`);
  const byFill = new Map<string, string>();
  for (const [, fill, d] of parts) {
    byFill.set(fill!, (byFill.get(fill!) ?? "") + roundPath(scalePath(d!, k, 256 - MARK_RADIUS, 256 - MARK_RADIUS)));
  }
  return [...byFill].map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join("");
}

/** The relief's measures, those of game-icon.tsx on the same 512 grid: the outline's width, the shadow's drop, the light's depth. */
const OUTLINE = 72;
const DROP = 28;
const RIM = 22;

export function buildCoin(coin: Coin, source: string = readFileSync(SOURCE, "utf8"), mark?: string): string {
  const { width, height, path } = readIcon(source, "coin-front");
  if (width !== 512 || height !== 512) throw new Error(`coin-front: ${width} by ${height}, the coins assume 512 by 512`);
  // coin-front's subpaths: the coin, its face, the groove's outer edge, the mark (replaced by the P).
  const [disc, face, groove] = splitPath(path).map(roundPath) as [string, string, string];
  const c = steps(COIN_BASES[coin]);
  const usdc = coin === "usdc";
  const p = usdc ? "" : letterP();
  const half = OUTLINE / 2;
  // The coin, its outline and its shadow, nothing more: the box is square, the shadow's drop shared out left and right.
  const side = 512 + OUTLINE + DROP;
  const box = [-half - DROP / 2, -half, side, side];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(" ")}">`,
    "<defs>",
    usdc ? `<path id="o" d="${disc}"/>` : `<path id="o" d="${disc}"/><path id="f" d="${face}"/><path id="p" d="${p}"/>`,
    // The lit gradient (top light, foot shaded) and its reverses for what is sunk (the groove, the face).
    `<linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="${c.hi}"/><stop offset=".45" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.lo}"/></linearGradient>`,
    `<linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="${c.edge}"/><stop offset="1" stop-color="${c.lo}"/></linearGradient>`,
    usdc ? "" : `<linearGradient id="d" x2="0" y2="1"><stop offset="0" stop-color="${c.lo}"/><stop offset="1" stop-color="${c.mid}"/></linearGradient>`,
    // The light along the upper edges: a shape, less itself moved down.
    `<mask id="r"><use href="#o" fill="#fff"/><use href="#o" y="${RIM}"/></mask>`,
    usdc ? "" : `<mask id="q"><use href="#p" fill="#fff"/><use href="#p" y="${RIM / 2}"/></mask>`,
    "</defs>",
    // The shadow under the coin (black, the default fill), the outline included; one element at low opacity, so the stroke does not
    // darken the fill.
    `<use href="#o" y="${DROP}" stroke="#000" stroke-width="${OUTLINE}" opacity=".45"/>`,
    `<use href="#o" fill="${c.edge}" stroke="${c.edge}" stroke-width="${OUTLINE}"/>`,
    `<use href="#o" fill="url(#g)"/>`,
    `<use href="#o" mask="url(#r)" fill="#fff" fill-opacity=".55"/>`,
    // The groove and the face, sunk: dark at their top, where the light does not reach, so the P stands out lit.
    ...(usdc
      ? // USDC's groove (a circle: shorter, the same shape) and the mark on its face, as published: no outline, light or shadow on it.
        [`<circle cx="256" cy="256" r="192" fill="url(#s)"/>`, usdcMark(mark)]
      : [
          `<path d="${groove}" fill="url(#s)"/>`,
          `<use href="#f" fill="url(#d)"/>`,
          // The P, embossed: its outline, its fill and the light along its upper edges.
          `<use href="#p" fill="${c.edge}" stroke="${c.edge}" stroke-width="${OUTLINE / 2}" stroke-linejoin="round"/>`,
          `<use href="#p" fill="url(#g)"/>`,
          `<use href="#p" mask="url(#q)" fill="#fff" fill-opacity=".55"/>`,
        ]),
    "</svg>",
  ].join("");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const source = readFileSync(SOURCE, "utf8");
  const mark = readFileSync(USDC_MARK, "utf8");
  for (const coin of Object.keys(COIN_PATHS) as Coin[]) {
    const text = buildCoin(coin, source, mark);
    if (process.argv.includes("--check")) {
      if (readFileSync(COIN_PATHS[coin], "utf8") !== text) {
        console.error(`${coin}.svg is stale: run \`bun run coins\` in packages/app and commit it.`);
        process.exit(1);
      }
    } else {
      writeFileSync(COIN_PATHS[coin], text);
      console.log(`wrote ${COIN_PATHS[coin]} (${Buffer.byteLength(text)} bytes)`);
    }
  }
}
