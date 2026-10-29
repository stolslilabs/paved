/**
 * The game icons' shapes (#844): `src/components/elements/game-icon-shapes.ts` is generated from the owner's Font Awesome Pro
 * file (`vendor/fontawesome/solid.min.js`, the whole file, outside `public/`), one entry per HUD icon, so the icons are in the
 * bundle and draw at the first paint, with no script to wait for. `GameIcon` paints each part in its own tone. The world's
 * icons (#870: the structure categories, the seasons) are a second file, `world-icon-shapes.ts`, drawn by `WorldIcon`: only
 * the lazy chunks that show them (the closings, the village's kinds, the season wheel) load it, not the home's first load.
 *
 *   node scripts/game-icons.ts            write the shapes files
 *   node scripts/game-icons.ts --check    fail when a committed file differs from what the source gives
 *
 * Node 24 runs it as is (type stripping): the syntax stays erasable. No package.
 *
 * Each icon's path is cut into its subpaths (a part each, so `GameIcon` can tone them apart), every subpath starting with an
 * absolute `M`: a relative `m` after a `z` starts from the closed subpath's first point, so it is rewritten from there.
 * The drawing is Font Awesome's, unchanged; `public/THIRD_PARTY_NOTICES.txt` records each icon as derived.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE = join(ROOT, "vendor/fontawesome/solid.min.js");
export const SHAPES_PATH = join(ROOT, "src/components/elements/game-icon-shapes.ts");

/** The HUD's icons (#844's list): the overlay buttons, the phone's bar, the plates, Play, Edit, Found; the village's (#870); the Chests' (#873, in the gift's place). Solid, by name. */
export const GAME_ICON_NAMES = [
  "gear",
  "hammer",
  "house",
  "house-tree",
  "piggy-bank",
  "plus",
  "scroll",
  "shield-halved",
  "store",
  "swords",
  "treasure-chest",
  "trophy",
] as const;

/** The world's icons (#870): the four structure categories, then the season wheel's seasons and its sun and moon. */
export const WORLD_ICON_NAMES = ["tree", "road", "castle", "landmark-dome", "sun", "leaf", "snowflake", "seedling", "moon"] as const;

export const WORLD_SHAPES_PATH = join(ROOT, "src/components/elements/world-icon-shapes.ts");

/** The two generated files: their names, their constant, their name type. */
export const SHAPE_SETS = [
  { names: GAME_ICON_NAMES, path: SHAPES_PATH, constant: "GAME_ICON_SHAPES", type: "GameIconName", what: "HUD icon" },
  { names: WORLD_ICON_NAMES, path: WORLD_SHAPES_PATH, constant: "WORLD_ICON_SHAPES", type: "WorldIconName", what: "world icon" },
] as const;

export interface Shape {
  /** The source's width (its height is 512). */
  width: number;
  /** The subpaths, in the source's order, each from an absolute `M`. */
  parts: string[];
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i;

/** Read `count` numbers from the front of `text` (Font Awesome's minified separators: space, comma, or a sign or dot alone). */
function readNumbers(text: string, count: number): { values: number[]; rest: string } {
  const values: number[] = [];
  let rest = text;
  while (values.length < count) {
    rest = rest.replace(/^[\s,]+/, "");
    const m = NUMBER.exec(rest);
    if (!m) throw new Error(`expected a number at "${rest.slice(0, 20)}"`);
    values.push(Number(m[0]));
    rest = rest.slice(m[0].length);
  }
  return { values, rest };
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** Cut a path into its subpaths, each starting with an absolute `M`. */
export function splitPath(d: string): string[] {
  const chunks = d.split(/(?=[Mm])/).filter((c) => c.trim() !== "");
  const out: string[] = [];
  let start: [number, number] = [0, 0];
  for (const chunk of chunks) {
    const relative = chunk[0] === "m";
    const { values, rest } = readNumbers(chunk.slice(1), 2);
    // Only after a `z`: the current point is then the closed subpath's first point. A first `m` is absolute by the spec.
    const x = relative && out.length > 0 ? start[0] + values[0]! : values[0]!;
    const y = relative && out.length > 0 ? start[1] + values[1]! : values[1]!;
    if (relative && out.length > 0 && !/[zZ]\s*$/.test(out[out.length - 1]!)) throw new Error("a relative m that does not follow a z");
    start = [x, y];
    // Pairs right after a moveto are linetos, relative after `m`: keep them relative with an explicit `l`.
    const tail = rest.replace(/^[\s,]+/, "");
    const implicit = relative && NUMBER.test(tail) ? "l" : "";
    out.push(`M${fmt(x)} ${fmt(y)}${implicit}${implicit ? tail : rest}`);
  }
  return out;
}

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * One subpath (from an absolute `M`) rounded to whole units of the 512 grid: 0.06 px at 64 px, below what a screen shows. Every
 * point is rounded where it lands (absolute), so the error never adds up along the path; each command is then written in the
 * shorter of its absolute and relative forms, a line along an axis as `h`/`v`, and a line that rounds to nothing is dropped.
 */
export function roundPath(d: string): string {
  const tokens = d.match(/[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) ?? [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  // The true point and subpath start, unrounded: a relative command lands from there, so the rounding never adds up.
  let tx = 0;
  let ty = 0;
  let tsx = 0;
  let tsy = 0;
  let out = "";
  let last = "";
  const num = () => Number(tokens[i++]);
  const list = (ns: number[]) => ns.map((n, k) => (k > 0 && n >= 0 ? " " : "") + n).join("");
  const emit = (letter: string, ns: number[]) => {
    const body = list(ns);
    // A repeated command needs no letter (but a moveto's repeats are linetos), only a separator.
    if (letter === last && letter.toUpperCase() !== "M") out += (ns[0]! < 0 ? "" : " ") + body;
    else out += letter + body;
    last = letter;
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    else if (cmd === "M") cmd = "L";
    else if (cmd === "m") cmd = "l";
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const a = Array.from({ length: ARGS[up]! }, num);
    const ox = rel ? tx : 0;
    const oy = rel ? ty : 0;
    const pts: number[] = [];
    if (up === "Z") {
      out += "z";
      last = "z";
      x = sx;
      y = sy;
      tx = tsx;
      ty = tsy;
      continue;
    }
    // An axis line, to the shorter of its absolute and relative forms.
    const axis = (letter: "H" | "V", v: number, base: number) => {
      if (v === base) return;
      if (String(v).length <= String(v - base).length) emit(letter, [v]);
      else emit(letter.toLowerCase(), [v - base]);
    };
    if (up === "H") {
      tx = ox + a[0]!;
      const nx = Math.round(tx);
      axis("H", nx, x);
      x = nx;
      continue;
    }
    if (up === "V") {
      ty = oy + a[0]!;
      const ny = Math.round(ty);
      axis("V", ny, y);
      y = ny;
      continue;
    }
    if (up === "A") {
      const nx = Math.round(ox + a[5]!);
      const ny = Math.round(oy + a[6]!);
      const head = [Math.max(1, Math.round(a[0]!)), Math.max(1, Math.round(a[1]!)), Math.round(a[2]!), a[3]!, a[4]!];
      const abs = [...head, nx, ny];
      const r = [...head, nx - x, ny - y];
      if (list(abs).length < list(r).length) emit("A", abs);
      else emit("a", r);
      x = nx;
      y = ny;
      tx = ox + a[5]!;
      ty = oy + a[6]!;
      continue;
    }
    for (let k = 0; k < a.length; k += 2) pts.push(Math.round(ox + a[k]!), Math.round(oy + a[k + 1]!));
    const nx = pts[pts.length - 2]!;
    const ny = pts[pts.length - 1]!;
    tx = ox + a[a.length - 2]!;
    ty = oy + a[a.length - 1]!;
    if (up === "M") {
      emit("M", [nx, ny]);
      sx = nx;
      sy = ny;
      tsx = tx;
      tsy = ty;
    } else if (up === "L" && (nx === x || ny === y)) {
      if (nx === x) axis("V", ny, y);
      else axis("H", nx, x);
    } else {
      const r = pts.map((p, k) => p - (k % 2 ? y : x));
      if (list(pts).length < list(r).length) emit(up, pts);
      else emit(up.toLowerCase(), r);
    }
    x = nx;
    y = ny;
  }
  return out;
}

/** The entry of `name` in a Font Awesome icon file: `name:[width,height,[aliases],"unicode","path"]`. */
export function readIcon(source: string, name: string): { width: number; height: number; path: string } {
  const re = new RegExp(`(?:"${name}"|[,{]${name.replace(/-/g, "\\-")}):\\[(\\d+),(\\d+),\\[[^\\]]*\\],"[0-9a-f]+","([^"]*)"\\]`);
  const m = re.exec(source);
  if (!m) throw new Error(`no solid icon "${name}" in ${SOURCE}`);
  return { width: Number(m[1]), height: Number(m[2]), path: m[3]! };
}

export function buildShapes(source: string = readFileSync(SOURCE, "utf8"), set: (typeof SHAPE_SETS)[number] = SHAPE_SETS[0]): string {
  const lines = set.names.map((name) => {
    const { width, height, path } = readIcon(source, name);
    if (height !== 512) throw new Error(`${name}: height ${height}, the game icons assume 512`);
    const parts = splitPath(path).map((p) => JSON.stringify(roundPath(p)));
    return `  ${JSON.stringify(name)}: { width: ${width}, parts: [${parts.join(", ")}] },`;
  });
  return [
    "// Generated by scripts/game-icons.ts from Font Awesome Pro 6.6.0 (solid), under the owner's Font Awesome Commercial License",
    "// (public/THIRD_PARTY_NOTICES.txt). Do not edit: run `bun run game-icons` in packages/app.",
    "",
    `/** Each ${set.what}'s width (its height is 512) and its subpaths, each from an absolute \`M\`. */`,
    `export const ${set.constant} = {`,
    ...lines,
    "} as const satisfies Record<string, { width: number; parts: readonly string[] }>;",
    "",
    `export type ${set.type} = keyof typeof ${set.constant};`,
    "",
  ].join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const source = readFileSync(SOURCE, "utf8");
  for (const set of SHAPE_SETS) {
    const text = buildShapes(source, set);
    if (process.argv.includes("--check")) {
      if (readFileSync(set.path, "utf8") !== text) {
        console.error(`${basename(set.path)} is stale: run \`bun run game-icons\` in packages/app and commit it.`);
        process.exit(1);
      }
    } else {
      writeFileSync(set.path, text);
      console.log(`wrote ${set.path} (${Buffer.byteLength(text)} bytes, ${set.names.length} icons)`);
    }
  }
}
