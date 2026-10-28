/**
 * PAVED's and vPAVED's coins (#853): `src/assets/tokens/paved.svg` (gold) and `vpaved.svg` (silver) are generated from Font Awesome
 * Pro's `coin-front` (`vendor/fontawesome/solid.min.js`), its centre's mark replaced by the "P" of the display font (Almendra Bold, as
 * outlines), in the game icons' relief (#844, `elements/game-icon.tsx`): the thick dark outline, the lit gradient, the light along
 * the upper edges and the shadow under the coin, in the gold and the steel tones of the palette (theme.css, 3f).
 *
 *   node scripts/coins.ts            write the two files
 *   node scripts/coins.ts --check    fail when a committed file differs from what the source gives
 *
 * Node 24 runs it as is (type stripping): the syntax stays erasable. No package.
 * `public/THIRD_PARTY_NOTICES.txt` records `coin-front` as derived and the "P" as Almendra Bold's.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readIcon, ROOT, roundPath, SOURCE, splitPath } from "./game-icons.ts";

export const COIN_PATHS = { paved: join(ROOT, "src/assets/tokens/paved.svg"), vpaved: join(ROOT, "src/assets/tokens/vpaved.svg") } as const;
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

/** The tones' bases (theme.css, 3f): PAVED the gold (`--game-gold`, gold-300), vPAVED the steel (`--game-steel`, charcoal-200). */
export const COIN_BASES: Record<Coin, string> = { paved: "#F0BF5B", vpaved: "#DADBDF" };

/** The relief's measures, those of game-icon.tsx on the same 512 grid: the outline's width, the shadow's drop, the light's depth. */
const OUTLINE = 72;
const DROP = 28;
const RIM = 22;

export function buildCoin(coin: Coin, source: string = readFileSync(SOURCE, "utf8")): string {
  const { width, height, path } = readIcon(source, "coin-front");
  if (width !== 512 || height !== 512) throw new Error(`coin-front: ${width} by ${height}, the coins assume 512 by 512`);
  // coin-front's subpaths: the coin, its face, the groove's outer edge, the mark (replaced by the P).
  const [disc, face, groove] = splitPath(path).map(roundPath) as [string, string, string];
  const c = steps(COIN_BASES[coin]);
  const p = letterP();
  const half = OUTLINE / 2;
  // The coin, its outline and its shadow, nothing more: the box is square, the shadow's drop shared out left and right.
  const side = 512 + OUTLINE + DROP;
  const box = [-half - DROP / 2, -half, side, side];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(" ")}">`,
    "<defs>",
    `<path id="o" d="${disc}"/><path id="f" d="${face}"/><path id="p" d="${p}"/>`,
    // The lit gradient (top light, foot shaded) and its reverses for what is sunk (the groove, the face).
    `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.hi}"/><stop offset=".45" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.lo}"/></linearGradient>`,
    `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.edge}"/><stop offset="1" stop-color="${c.lo}"/></linearGradient>`,
    `<linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.lo}"/><stop offset="1" stop-color="${c.mid}"/></linearGradient>`,
    // The light along the upper edges: a shape, less itself moved down.
    `<mask id="r"><use href="#o" fill="#fff"/><use href="#o" y="${RIM}"/></mask>`,
    `<mask id="q"><use href="#p" fill="#fff"/><use href="#p" y="${RIM / 2}"/></mask>`,
    "</defs>",
    // The shadow under the coin, the outline included; one element at low opacity, so the stroke does not darken the fill.
    `<use href="#o" y="${DROP}" fill="#000" stroke="#000" stroke-width="${OUTLINE}" opacity=".45"/>`,
    `<use href="#o" fill="${c.edge}" stroke="${c.edge}" stroke-width="${OUTLINE}"/>`,
    `<use href="#o" fill="url(#g)"/>`,
    `<use href="#o" mask="url(#r)" fill="#fff" fill-opacity=".55"/>`,
    // The groove and the face, sunk: dark at their top, where the light does not reach, so the P stands out lit.
    `<path d="${groove}" fill="url(#s)"/>`,
    `<use href="#f" fill="url(#d)"/>`,
    // The P, embossed: its outline, its fill and the light along its upper edges.
    `<use href="#p" fill="${c.edge}" stroke="${c.edge}" stroke-width="${OUTLINE / 2}" stroke-linejoin="round"/>`,
    `<use href="#p" fill="url(#g)"/>`,
    `<use href="#p" mask="url(#q)" fill="#fff" fill-opacity=".55"/>`,
    "</svg>",
  ].join("");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const source = readFileSync(SOURCE, "utf8");
  for (const coin of Object.keys(COIN_PATHS) as Coin[]) {
    const text = buildCoin(coin, source);
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
