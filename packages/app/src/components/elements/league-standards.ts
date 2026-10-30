import type { League, LeagueId } from "../../lib/pvp-rules";

/**
 * The leagues' standards (issue 917, after the owner's design): for each of the ten tiers a crest, a plate (its name) and a banner,
 * drawn here as toned parts that `ArtSvg` (`league-art.tsx`) renders in the game icons' relief (issue 844's codes: a dark outline of
 * the part's own hue, a lit gradient, a light along the upper edges, a shadow). Pure SVG, no image: the design is the reference only.
 */

/** The ten tiers: Unranked (a player outside the leagues, a client state) and the nine groups of `LeagueId`. */
export type LeagueTier = "unranked" | LeagueId;

/** The ten tiers up the ladder, with their names. */
export const LEAGUE_TIERS: readonly { id: LeagueTier; name: string }[] = [
  { id: "unranked", name: "Unranked" },
  { id: "wood", name: "Wood" },
  { id: "iron", name: "Iron" },
  { id: "bronze", name: "Bronze" },
  { id: "silver", name: "Silver" },
  { id: "gold", name: "Gold" },
  { id: "emerald", name: "Emerald" },
  { id: "diamond", name: "Diamond" },
  { id: "master", name: "Master" },
  { id: "grandmaster", name: "Grand Master" },
];

/** A league's tier; none (a player who has not entered the leagues) is Unranked. */
export const tierOf = (league: Pick<League, "id"> | null | undefined): LeagueTier => league?.id ?? "unranked";

/** A league's division as pips (issue 917's open point 3): III one, II two, I three; none for Wood and Grand Master. */
export function pipsOf(league: Pick<League, "index">): 0 | 1 | 2 | 3 {
  return league.index < 1 || league.index > 21 ? 0 : (((league.index - 1) % 3) + 1) as 1 | 2 | 3;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Tones: bases derived from the game icons' tones (theme.css 3f), mixed or shifted, so the standards add no token and no CSS (the
// stylesheet's budget has no room): `ArtSvg` mixes each base into its lit top, its shaded foot and its outline.

const g = (name: string) => `var(--game-${name})`;
const mixOf = (a: string, share: number, b: string) => `color-mix(in oklab, ${a} ${share}%, ${b})`;
/** A game tone made deeper: its lightness scaled, its chroma scaled, its hue turned (a mix toward the ink would grey it). */
const deep = (name: string, l: number, c = 1, turn = 0) => `oklch(from ${g(name)} calc(l * ${l}) calc(c * ${c}) calc(h + ${turn}))`;
const INK = g("ink");

export const TONES = {
  light: g("light"),
  /** The plates' dark face. */
  night: mixOf(g("stone"), 20, INK),
  plank: mixOf(mixOf(g("wood"), 45, g("stone")), 72, INK),
  plankDark: mixOf(mixOf(g("wood"), 45, g("stone")), 45, INK),
  /** Unranked's torn cloth. */
  linen: mixOf(mixOf(g("wood"), 30, g("stone")), 80, g("light")),
  wood: deep("wood", 0.72, 0.9),
  woodDark: deep("wood", 0.52, 0.8),
  leaf: g("green"),
  moss: deep("green", 0.6, 0.85),
  iron: mixOf(g("stone"), 58, INK),
  ironDark: mixOf(g("stone"), 30, INK),
  steel: g("steel"),
  copper: deep("orange", 0.78, 1.05, -14),
  copperDark: deep("orange", 0.56, 0.95, -16),
  copperLight: deep("orange", 1, 0.7),
  silver: mixOf(g("steel"), 78, g("blue")),
  slate: mixOf(mixOf(g("steel"), 55, g("blue")), 42, INK),
  gold: g("gold"),
  goldDark: deep("gold", 0.52, 0.8, -12),
  ruby: deep("red", 0.74, 1.3),
  crimson: deep("red", 0.62, 1.2),
  flame: deep("orange", 0.86, 1.25, -6),
  emerald: deep("green", 0.68),
  emeraldDark: deep("green", 0.46, 0.85),
  emeraldGem: deep("green", 0.9, 1.1, 8),
  sapphire: deep("blue", 0.7, 1.1),
  sapphireDark: deep("blue", 0.46, 0.9),
  crystal: mixOf(g("blue"), 65, g("ice")),
  purple: deep("blue", 0.64, 1.1, 56),
  purpleDark: deep("blue", 0.42, 0.95, 56),
  amethyst: deep("blue", 0.9, 1.35, 60),
} as const;
export type Tone = keyof typeof TONES;

/** Each tier's materials: the crest's frame and field, its motif and metal trim, the banner's cloth, and its gem (if any). */
interface Look {
  frame: Tone;
  field: Tone;
  motif: Tone;
  trim: Tone;
  cloth: Tone;
  gem?: Tone;
}
export const LOOKS: Record<LeagueTier, Look> = {
  unranked: { frame: "plank", field: "plankDark", motif: "plank", trim: "iron", cloth: "linen" },
  wood: { frame: "wood", field: "woodDark", motif: "leaf", trim: "wood", cloth: "moss" },
  iron: { frame: "iron", field: "ironDark", motif: "steel", trim: "iron", cloth: "ironDark" },
  bronze: { frame: "copper", field: "copperDark", motif: "copperLight", trim: "copper", cloth: "copper" },
  silver: { frame: "silver", field: "slate", motif: "steel", trim: "silver", cloth: "slate", gem: "crystal" },
  gold: { frame: "gold", field: "goldDark", motif: "gold", trim: "gold", cloth: "crimson", gem: "ruby" },
  emerald: { frame: "emerald", field: "emeraldDark", motif: "emeraldGem", trim: "gold", cloth: "emerald", gem: "emeraldGem" },
  diamond: { frame: "sapphire", field: "sapphireDark", motif: "crystal", trim: "silver", cloth: "sapphire", gem: "crystal" },
  master: { frame: "purple", field: "purpleDark", motif: "gold", trim: "gold", cloth: "purple", gem: "amethyst" },
  grandmaster: { frame: "gold", field: "crimson", motif: "gold", trim: "gold", cloth: "crimson", gem: "ruby" },
};

// ---------------------------------------------------------------------------------------------------------------------------
// Parts and geometry.

/** Where a part drawn around its own origin sits: its centre, its scale, a turn in degrees, a mirror. */
export interface Place {
  x: number;
  y: number;
  s?: number;
  r?: number;
  flip?: boolean;
}

/**
 * A part: a path, its tone, where it sits (none: drawn on the grid as is). `w` scales its outline (an inlay takes a thinner one); a
 * `flat` part is a groove, the outline's ink of its tone, with no relief.
 */
export interface Part {
  d: string;
  tone: Tone;
  at?: Place;
  w?: number;
  flat?: boolean;
}

type Pt = readonly [number, number];
const n1 = (v: number) => Math.round(v * 10) / 10;
const pt = ([x, y]: Pt) => `${n1(x)} ${n1(y)}`;
/** A closed polygon. */
export const poly = (pts: readonly Pt[]) => `M${pts.map(pt).join("L")}z`;
/** A circle, as two half arcs. */
export const circle = (x: number, y: number, r: number) => `M${n1(x - r)} ${n1(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (x: number, y: number, r: number, deg: number): Pt => [x + r * Math.cos(rad(deg)), y + r * Math.sin(rad(deg))];
/** A hexagon standing on a point (the crests' frame): its corners from the top, clockwise. */
export const hexPts = (x: number, y: number, r: number): Pt[] => [-90, -30, 30, 90, 150, 210].map((a) => polar(x, y, r, a));
export const hex = (x: number, y: number, r: number) => poly(hexPts(x, y, r));
/** A groove along a mostly upright line, `w` wide: a crack, the gap between two boards. */
export const groove = (pts: readonly Pt[], w: number) => poly([...pts.map(([x, y]): Pt => [x - w / 2, y]), ...[...pts].reverse().map(([x, y]): Pt => [x + w / 2, y])]);
/** A gem cut as a lozenge, `w` half-wide and `h` half-high. */
export const lozenge = (x: number, y: number, w: number, h: number) => poly([[x, y - h], [x + w, y], [x, y + h], [x - w, y]]);

/** A leaf from its stalk at (x, y), `len` long and `w` half-wide, its tip toward `deg` (0 to the right, 90 down). */
export function leaf(x: number, y: number, len: number, w: number, deg: number): string {
  const u: Pt = [Math.cos(rad(deg)), Math.sin(rad(deg))];
  const nrm: Pt = [-u[1], u[0]];
  const at = (a: number, b: number): Pt => [x + a * u[0] + b * nrm[0], y + a * u[1] + b * nrm[1]];
  const c = (p: Pt) => pt(p);
  return `M${c([x, y])}C${c(at(len * 0.25, w * 1.3))} ${c(at(len * 0.7, w))} ${c(at(len, 0))}C${c(at(len * 0.7, -w))} ${c(at(len * 0.25, -w * 1.3))} ${c([x, y])}z`;
}

/** A crystal from its foot at (x, y), `len` long and `w` half-wide, its point toward `deg`. */
export function crystal(x: number, y: number, len: number, w: number, deg: number): string {
  const u: Pt = [Math.cos(rad(deg)), Math.sin(rad(deg))];
  const nrm: Pt = [-u[1], u[0]];
  const at = (a: number, b: number): Pt => [x + a * u[0] + b * nrm[0], y + a * u[1] + b * nrm[1]];
  return poly([at(0, -w * 0.8), at(len * 0.62, -w), at(len, 0), at(len * 0.62, w), at(0, w * 0.8)]);
}

/** A branch of laurel on the arc of radius `r` round (x, y), from `from` to `to` degrees: leaves in pairs, one out, one in. */
export function laurel(x: number, y: number, r: number, from: number, to: number, count: number, len: number, w: number): string {
  const dir = Math.sign(to - from);
  return Array.from({ length: count }, (_, i) => {
    const a = from + ((to - from) * (i + 0.5)) / count;
    const [px, py] = polar(x, y, r, a);
    const along = a + dir * 90;
    return leaf(px, py, len, w, along - dir * 38) + leaf(px, py, len * 0.85, w * 0.9, along + dir * 34);
  }).join("");
}

/** Mirror a drawn part across the crest's middle (x = 256). */
const MIRROR: Place = { x: 512, y: 0, flip: true };
const mirrored = (part: Part): Part => ({ ...part, at: MIRROR });
const pair = (part: Part): Part[] => [part, mirrored(part)];

// Motifs, each drawn round its own origin.

/** A sword pointing up, 300 long: its blade and fuller, its guard, grip and pommel. */
function sword(at: Place, blade: Tone, hilt: Tone, detail: Detail): Part[] {
  const parts: Part[] = [
    { d: "M0 -150L18 -124V40H-18V-124z", tone: blade, at },
    { d: "M-58 40H58A12 12 0 0 1 58 64H-58A12 12 0 0 1 -58 40z", tone: hilt, at },
    { d: "M-10 64H10V110H-10z", tone: "wood", at },
    { d: circle(0, 124, 17), tone: hilt, at },
  ];
  if (detail === "full") parts.splice(1, 0, { d: "M-4 -116H4V30H-4z", tone: blade, at, flat: true });
  return parts;
}

/** Two swords crossed. */
const swords = (x: number, y: number, s: number, blade: Tone, hilt: Tone, detail: Detail): Part[] => [
  ...sword({ x, y, s, r: -42 }, blade, hilt, detail),
  ...sword({ x, y, s, r: 42 }, blade, hilt, detail),
];

/** A helm with a T-shaped visor, seen from the front, 216 wide: its shell, its ridge, its visor. */
function helm(at: Place, shell: Tone, ridge: Tone, detail: Detail): Part[] {
  return [
    { d: "M0 -122C68 -122 108 -76 108 -8V64L72 118H30V70H-30V118H-72L-108 64V-8C-108 -76 -68 -122 0 -122z", tone: shell, at },
    ...(detail === "full" ? [{ d: "M-15 -120H15V-30H-15z", tone: ridge, at, w: 0.6 }] : []),
    { d: "M-88 -16H-16V62H-34V12H-84zM88 -16H16V62H34V12H84z", tone: shell, at, flat: true },
  ];
}

/** A crown, 170 wide: five points, a pearl on each, a band. */
function crown(at: Place, tone: Tone, pearl: Tone, detail: Detail): Part[] {
  const peaks: Pt[] = [[-80, -30], [-40, -52], [0, -66], [40, -52], [80, -30]];
  return [
    { d: "M-84 44V-30L-60 2L-40 -52L-20 2L0 -66L20 2L40 -52L60 2L84 -30V44z", tone, at },
    ...(detail === "full" ? [{ d: "M-84 18H84V28H-84z", tone, at, flat: true }] : []),
    { d: peaks.map(([x, y]) => circle(x, y - 6, 13)).join(""), tone: pearl, at, w: 0.6 },
  ];
}

/** Two leaves on a stalk (Wood's). */
const sprig = (at: Place): Part[] => [
  { d: "M-6 110C-10 60 -4 10 4 -20L14 -18C6 12 2 60 6 110z", tone: "wood", at },
  { d: leaf(0, 10, 150, 46, -140), tone: "leaf", at },
  { d: leaf(4, -10, 170, 50, -50), tone: "leaf", at },
];

/** A horn curling up from the left of the crest's top, the right one its mirror. */
const HORN = "M150 196C92 150 78 70 112 -2C108 66 130 118 188 152z";

// ---------------------------------------------------------------------------------------------------------------------------
// The crest, on the 512 grid: its hexagon round (256, 262), 168 to a corner; its field 132.

export type Detail = "full" | "icon";
export const CREST = { x: 256, y: 262, r: 168, field: 132 } as const;
const C = CREST;
const FRAME = hex(C.x, C.y, C.r);
const FIELD = hex(C.x, C.y, C.field);
const corners = hexPts(C.x, C.y, C.r - 18);
const studs = (tone: Tone, which = [0, 1, 2, 3, 4, 5]): Part => ({ d: which.map((i) => circle(corners[i]![0], corners[i]![1], 11)).join(""), tone, w: 0.5 });

/** The frame and its field, each tier's own materials. */
const shield = (t: LeagueTier, detail: Detail): Part[] => [
  { d: FRAME, tone: LOOKS[t].frame },
  { d: FIELD, tone: LOOKS[t].field, w: 0.7 },
  ...(detail === "full" ? [studs(LOOKS[t].trim)] : []),
];

/** The planks of a field, `n` of them, each between the hexagon's edges (and the gaps between them grooves). */
function planks(r: number, n: number, gap: number): string[] {
  const half = r * Math.cos(rad(30));
  const top = (x: number) => C.y - r + Math.abs(x - C.x) * Math.tan(rad(30));
  const bottom = (x: number) => C.y + r - Math.abs(x - C.x) * Math.tan(rad(30));
  const width = (2 * half) / n;
  return Array.from({ length: n }, (_, i) => {
    const x0 = C.x - half + i * width + (i ? gap / 2 : 0);
    const x1 = C.x - half + (i + 1) * width - (i < n - 1 ? gap / 2 : 0);
    const mid = x0 < C.x && x1 > C.x ? [[C.x, C.y - r] as Pt] : [];
    const midB = x0 < C.x && x1 > C.x ? [[C.x, C.y + r] as Pt] : [];
    return poly([[x0, top(x0)], ...mid, [x1, top(x1)], [x1, bottom(x1)], ...midB, [x0, bottom(x0)]]);
  });
}

/** The grooves between `n` boards of a field. */
function boards(r: number, n: number): string {
  const half = r * Math.cos(rad(30));
  return Array.from({ length: n - 1 }, (_, i) => {
    const x = C.x - half + ((i + 1) * 2 * half) / n;
    const dy = r - Math.abs(x - C.x) * Math.tan(rad(30)) - 6;
    return groove([[x, C.y - dy], [x, C.y + dy]], 6);
  }).join("");
}

const gemTop = (tone: Tone, h = 34): Part => ({ d: lozenge(C.x, C.y - C.r + 4, h * 0.62, h), tone });
const gemFoot = (tone: Tone, h = 30): Part => ({ d: lozenge(C.x, C.y + C.r - 2, h * 0.62, h), tone });

/** Each tier's crest: what grows behind the frame (leaves, crystals, horns, wings), the frame, the motif, and what crowns it. */
export function crestParts(t: LeagueTier, detail: Detail = "full"): Part[] {
  const full = detail === "full";
  const L = LOOKS[t];
  switch (t) {
    case "unranked": {
      // Broken planks bound by a split frame: a plank missing, its neighbours cracked.
      const p = planks(C.r - 6, 4, 10);
      return [
        { d: FRAME, tone: "plankDark" },
        ...p.map((d, i): Part => ({ d, tone: "plank", ...(i === 2 && { at: { x: 0, y: 16 } }) })),
        ...(full
          ? [
              { d: groove([[190, 150], [206, 190], [194, 232], [214, 280], [200, 330]], 7), tone: "plank", flat: true } satisfies Part,
              { d: groove([[316, 160], [300, 214], [320, 262], [304, 318], [318, 372], [306, 400]], 7), tone: "plank", flat: true } satisfies Part,
              { d: poly([[160, 150], [196, 132], [204, 158], [168, 176]]), tone: L.trim, w: 0.6 } satisfies Part,
              { d: poly([[340, 360], [376, 340], [386, 366], [348, 384]]), tone: L.trim, w: 0.6 } satisfies Part,
              { d: leaf(150, 136, 40, 14, -150) + leaf(150, 136, 34, 12, -100), tone: "moss" } satisfies Part,
            ]
          : [{ d: groove([[196, 140], [222, 210], [196, 280], [224, 360]], 22), tone: "plank", flat: true } satisfies Part]),
      ];
    }
    case "wood":
      return [
        // Leaves sprouting from the corners.
        ...(full
          ? pair({ d: leaf(140, 150, 70, 22, -150) + leaf(140, 150, 62, 20, -105) + leaf(124, 360, 64, 20, 150), tone: "leaf" })
          : pair({ d: leaf(132, 162, 70, 26, -135), tone: "leaf" })),
        ...shield(t, detail),
        ...(full ? [{ d: boards(C.field, 4), tone: L.field, flat: true } satisfies Part] : []),
        ...sprig({ x: 256, y: 262, s: full ? 0.72 : 0.92 }),
      ];
    case "iron":
      return [...shield(t, detail), ...sword({ x: 256, y: 262, s: full ? 0.78 : 0.95 }, "steel", "gold", detail)];
    case "bronze":
      return [
        ...shield(t, detail),
        ...(full ? [{ d: laurel(256, 290, 100, 112, 212, 5, 34, 11) + laurel(256, 290, 100, 68, -32, 5, 34, 11), tone: "gold" } satisfies Part] : []),
        ...sword({ x: 256, y: 262, s: full ? 0.72 : 0.95 }, "copperLight", "gold", detail),
      ];
    case "silver":
      return [
        { d: poly([[256, 54], [290, 128], [222, 128]]), tone: "steel" },
        { d: poly([[256, 476], [284, 410], [228, 410]]), tone: "steel" },
        ...shield(t, detail),
        ...swords(256, 262, full ? 0.66 : 0.82, "steel", "steel", detail),
      ];
    case "gold":
      return [
        ...shield(t, detail),
        ...swords(256, 284, full ? 0.6 : 0.76, "gold", "gold", detail),
        ...crown({ x: 256, y: 172, s: full ? 0.42 : 0.5 }, "gold", "gold", detail),
        gemTop("ruby", full ? 34 : 42),
        gemFoot("gold", full ? 26 : 30),
      ];
    case "emerald":
      return [
        // Laurels of green and crystals round the frame.
        ...(full
          ? [
              { d: laurel(256, 262, 178, 98, 215, 6, 64, 20) + laurel(256, 262, 178, 82, -35, 6, 64, 20), tone: "emerald" } satisfies Part,
              ...pair({ d: crystal(92, 236, 70, 20, 195) + crystal(116, 380, 60, 18, 150), tone: "emeraldGem" }),
            ]
          : pair({ d: crystal(100, 250, 60, 24, 190), tone: "emeraldGem" })),
        ...shield(t, detail),
        ...helm({ x: 256, y: 270, s: full ? 0.82 : 0.84 }, "gold", "gold", detail),
        gemTop("emeraldGem", full ? 38 : 44),
        gemFoot("emeraldGem", full ? 30 : 34),
      ];
    case "diamond":
      return [
        // Crystals all round.
        ...(full
          ? pair({
              d:
                crystal(160, 140, 66, 20, -128) +
                crystal(104, 214, 60, 18, -168) +
                crystal(100, 310, 58, 18, 168) +
                crystal(150, 396, 54, 18, 128) +
                crystal(210, 112, 52, 15, -104),
              tone: "crystal",
            })
          : pair({ d: crystal(140, 140, 80, 28, -130) + crystal(96, 290, 66, 24, 175), tone: "crystal" })),
        ...shield(t, detail),
        ...helm({ x: 256, y: 270, s: full ? 0.82 : 0.84 }, "silver", "steel", detail),
        { d: crystal(256, 104, 76, 24, -90), tone: "crystal" },
        gemFoot("crystal", full ? 30 : 34),
      ];
    case "master":
      return [
        ...pair({ d: HORN, tone: "purple" }),
        ...(full ? pair({ d: crystal(100, 250, 54, 22, 185) + crystal(124, 390, 48, 20, 145), tone: "amethyst" }) : []),
        ...shield(t, detail),
        ...helm({ x: 256, y: 272, s: full ? 0.82 : 0.84 }, "gold", "gold", detail),
        { d: crystal(256, 108, 86, 26, -90), tone: "amethyst" },
        gemFoot("amethyst", full ? 30 : 34),
      ];
    case "grandmaster":
      return [
        // Wings of flame and gold, laurels under them, horns, a crown and its ruby.
        ...pair({
          d: full
            ? leaf(146, 290, 112, 26, -168) + leaf(146, 334, 108, 26, 172) + leaf(152, 376, 98, 24, 150)
            : leaf(150, 320, 96, 34, -175) + leaf(164, 396, 84, 30, 140),
          tone: "flame",
        }),
        ...(full
          ? [
              ...pair({ d: leaf(148, 236, 112, 28, -150) + leaf(156, 186, 100, 26, -128), tone: "gold" }),
              { d: laurel(256, 262, 182, 100, 160, 4, 60, 18) + laurel(256, 262, 182, 80, 20, 4, 60, 18), tone: "gold" } satisfies Part,
            ]
          : []),
        ...pair({ d: HORN, tone: "gold" }),
        ...shield(t, detail),
        ...helm({ x: 256, y: 278, s: full ? 0.82 : 0.84 }, "gold", "gold", detail),
        ...(full ? [{ d: lozenge(256, 196, 14, 22), tone: "ruby", w: 0.5 } satisfies Part] : []),
        ...crown({ x: 256, y: 86, s: full ? 0.78 : 0.7 }, "gold", "gold", detail),
        { d: lozenge(256, 64, full ? 20 : 24, full ? 30 : 34), tone: "ruby", w: 0.6 },
        gemFoot("ruby", full ? 32 : 36),
      ];
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The banner, on a 400 by 520 grid: its bar, its cloth with a border of the tier's metal, its emblem (the crest's motif), its gem.

export const BANNER = { width: 400, height: 520 } as const;
const CLOTH = "M44 34H356V392L200 492L44 392z";
const CLOTH_IN = "M66 50H334V380L200 466L66 380z";
const TORN = "M50 34H350V318L334 352L344 410L306 388L296 462L262 420L240 500L208 444L178 486L160 412L128 446L112 392L80 424L66 354L50 330z";

/** The banner's emblem: the tier's motif, flat on the cloth, round (200, 236). */
function emblem(t: LeagueTier): Part[] {
  const tone = LOOKS[t].motif;
  switch (t) {
    case "unranked":
      return [];
    case "wood":
      return sprig({ x: 200, y: 236, s: 0.9 });
    case "iron":
      return sword({ x: 200, y: 232, s: 0.82 }, "steel", "steel", "full");
    case "bronze":
      return [
        { d: laurel(200, 262, 100, 112, 212, 5, 32, 11) + laurel(200, 262, 100, 68, -32, 5, 32, 11), tone },
        ...sword({ x: 200, y: 232, s: 0.76 }, tone, tone, "full"),
      ];
    case "silver":
      return swords(200, 236, 0.66, "silver", "silver", "full");
    case "gold":
      return [...swords(200, 252, 0.6, "gold", "gold", "full"), ...crown({ x: 200, y: 140, s: 0.42 }, "gold", "gold", "full")];
    case "emerald":
      return helm({ x: 200, y: 236, s: 0.86 }, "emeraldGem", "emeraldGem", "full");
    case "diamond":
      return helm({ x: 200, y: 236, s: 0.86 }, "crystal", "crystal", "full");
    case "master":
      return helm({ x: 200, y: 236, s: 0.86 }, "amethyst", "amethyst", "full");
    case "grandmaster":
      return [
        { d: laurel(200, 262, 106, 112, 212, 5, 36, 12) + laurel(200, 262, 106, 68, -32, 5, 36, 12), tone: "gold" },
        ...helm({ x: 200, y: 250, s: 0.72 }, "gold", "gold", "full"),
        ...crown({ x: 200, y: 136, s: 0.46 }, "gold", "gold", "full"),
      ];
  }
}

export function bannerParts(t: LeagueTier): Part[] {
  const L = LOOKS[t];
  if (t === "unranked")
    return [
      { d: TORN, tone: "linen" },
      { d: groove([[120, 60], [126, 300]], 5) + groove([[200, 60], [196, 380]], 5) + groove([[282, 60], [288, 320]], 5), tone: "linen", flat: true },
      { d: "M24 8H376A14 14 0 0 1 376 44H24A14 14 0 0 1 24 8z", tone: "plank" },
    ];
  return [
    { d: CLOTH, tone: L.trim },
    { d: CLOTH_IN, tone: L.cloth, w: 0.7 },
    ...emblem(t).map((p) => ({ ...p, w: (p.w ?? 1) * 0.7 })),
    ...(L.gem ? [{ d: lozenge(200, 440, 16, 24), tone: L.gem, w: 0.6 } satisfies Part] : []),
    { d: "M24 8H376A14 14 0 0 1 376 44H24A14 14 0 0 1 24 8z", tone: L.trim },
    { d: lozenge(14, 26, 16, 24) + lozenge(386, 26, 16, 24), tone: L.trim === "iron" || L.trim === "silver" ? L.trim : "gold" },
  ];
}

// ---------------------------------------------------------------------------------------------------------------------------
// The plate, on a 520 by 112 grid: a dark face in a frame of the tier's metal, a stud at each end. The name is text over it.

export const PLATE = { width: 520, height: 112, font: 52, inner: 404 } as const;

export function plateParts(t: LeagueTier): Part[] {
  const trim = LOOKS[t].trim === "iron" ? "iron" : t === "unranked" ? "plank" : LOOKS[t].trim;
  return [
    { d: "M22 4H498A18 18 0 0 1 516 22V90A18 18 0 0 1 498 108H22A18 18 0 0 1 4 90V22A18 18 0 0 1 22 4z", tone: trim },
    { d: "M34 18H486A8 8 0 0 1 494 26V86A8 8 0 0 1 486 94H34A8 8 0 0 1 26 86V26A8 8 0 0 1 34 18z", tone: "night", w: 0.6 },
    { d: circle(44, 56, 9) + circle(476, 56, 9), tone: trim, w: 0.5 },
  ];
}
