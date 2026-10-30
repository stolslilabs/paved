import { useId, type CSSProperties } from "react";
import type { LeagueId } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { circle, MATERIAL_BASES, SIZE_REM, star, type CrestArtProps, type CrestMaterial } from "./crest-art";

/**
 * The fourth crest study (issue 854, after the owner turned down the third's shield and swords): league badges in the spirit of the
 * big strategy games' leagues, drawn for Paved. Each league its own silhouette (a buckler, an octagon, a heater shield, a pointed
 * shield, a crested one, a hexagon, a cut crystal, a horned shield, the same on a burst), in a material that climbs from wood to
 * gold, with a bevel, a metallic sheen, an enamelled field, a cut gem, and ornaments added up the ladder: wings, laurels, a banner,
 * a crown. No weapon.
 */

/** A paint: a material (a vertical metallic gradient), a gem or an enamel (a lit radial gradient), or the flat light or ink. */
export type BadgePaint = CrestMaterial | "red" | "blue" | "green" | "teal" | "ice" | "orange" | "light" | "ink";

/** One layer of a badge: its path, its paint, a thin edge of its own hue, its mirror on the right, a bevel, an opacity. */
export interface BadgeLayer {
  d: string;
  p: BadgePaint;
  /** The edge's width (a thin line of the paint's own hue, darker), none by default. */
  e?: number;
  /** Drawn again mirrored about the badge's axis (a wing, a laurel, a banner's tail). */
  m?: boolean;
  /** A field's inner bevel: an edge in this metal, lit from below, so the rim steps down to the field. */
  bevel?: CrestMaterial;
  o?: number;
}

/** What a badge carries beyond its body, added up the ladder. */
export type BadgeOrnament = "wings" | "laurel" | "star" | "banner" | "crown" | "burst";

/** A badge: its layers back to front, its field (the gloss is clipped to it), and its ornaments by name. */
export interface BadgeModel {
  layers: BadgeLayer[];
  field: string;
  ornaments: BadgeOrnament[];
}

const r = Math.round;
const P = (x: number, y: number) => `${r(x)} ${r(y)}`;
/** The point `d` from (x, y) at `deg` degrees (SVG's: 0 to the right, 90 down). */
const at = (x: number, y: number, d: number, deg: number): [number, number] => [x + d * Math.cos((deg * Math.PI) / 180), y + d * Math.sin((deg * Math.PI) / 180)];
const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => P(x, y)).join("L")}z`;
/** A regular polygon: `k` sides, its corners `rad` from (x, y), the first at `deg`. */
export const ngon = (k: number, rad: number, deg = -90, x = 256, y = 256) => poly(Array.from({ length: k }, (_, i) => at(x, y, rad, deg + (360 * i) / k)));

/** A leaf: a lens from its base, `len` long toward `deg`. */
function leaf(x: number, y: number, deg: number, len: number): string {
  const [mx, my] = at(x, y, len / 2, deg);
  const [ax, ay] = at(mx, my, len * 0.36, deg + 90);
  const [bx, by] = at(mx, my, len * 0.36, deg - 90);
  return `M${P(x, y)}Q${P(ax, ay)} ${P(...at(x, y, len, deg))}Q${P(bx, by)} ${P(x, y)}z`;
}

/** A laurel branch on the left (mirrored on the right): `k` pairs of leaves along an arc `rad` round the centre, from `a0` to `a1` degrees. */
export function laurel(rad: number, a0: number, a1: number, k: number, len: number): string {
  let d = "";
  for (let i = 0; i < k; i++) {
    const a = a0 + ((a1 - a0) * i) / (k - 1);
    const [x, y] = at(256, 256, rad, a);
    d += leaf(x, y, a + 50, len) + leaf(x, y, a + 130, len * 0.8);
  }
  return d;
}

/** A feather: from its root, `len` long toward `deg`, `w` wide each side at its end, which closes in a blunt point. */
function feather(x: number, y: number, deg: number, len: number, w: number): string {
  const [ex, ey] = at(x, y, len, deg);
  return `M${P(...at(x, y, w / 4, deg - 90))}L${P(...at(ex, ey, w, deg - 90))}Q${P(...at(ex, ey, w * 2.2, deg))} ${P(...at(ex, ey, w, deg + 90))}L${P(...at(x, y, w / 4, deg + 90))}z`;
}

/** The left wing (mirrored on the right): `k` long feathers fanned from a root, the upper ones longer, each over the one above it. */
export function wing(k: number, x: number, y: number, l0: number, l1: number, w: number): string {
  let d = "";
  for (let i = k - 1; i >= 0; i--) d += feather(x, y, 158 + (84 * i) / (k - 1), l0 + ((l1 - l0) * i) / (k - 1), w);
  return d;
}

/** The wing's coverts: a shorter row over the long feathers' roots. */
export const coverts = (k: number, x: number, y: number, l0: number, l1: number, w: number) => wing(k, x + 10, y + 6, l0 * 0.6, l1 * 0.62, w * 1.05);

/** Both rows of a wing in one metal. */
const wings = (k: number, x: number, y: number, l0: number, l1: number, w: number, p: BadgePaint): BadgeLayer[] => [
  { d: wing(k, x, y, l0, l1, w), p, e: 5, m: true },
  { d: coverts(k - 1, x, y, l0, l1, w), p, e: 5, m: true },
];

/** A cut gem: the stone (an octagon), its lit table, a glint. */
function gem(x: number, y: number, rad: number, p: BadgePaint): BadgeLayer[] {
  return [
    { d: ngon(8, rad, -67.5, x, y), p, e: 8 },
    { d: ngon(8, rad * 0.55, -67.5, x - rad * 0.08, y - rad * 0.1), p: "light", o: 0.3 },
    { d: star(4, rad * 0.55, rad * 0.12, x - rad * 0.32, y - rad * 0.36), p: "light", o: 0.9 },
  ];
}

/** A round stud or cabochon, with its glint. */
const stud = (x: number, y: number, rad: number, p: BadgePaint): BadgeLayer[] => [
  { d: circle(x, y, rad), p, e: rad > 20 ? 8 : 4 },
  { d: circle(x - rad * 0.32, y - rad * 0.34, rad * 0.3), p: "light", o: 0.75 },
];

/** Small rivets or nails, one path for them all (no glint: too small to see one). */
const rivets = (pts: [number, number][], rad: number, p: BadgePaint): BadgeLayer => ({ d: pts.map(([x, y]) => circle(r(x), r(y), rad)).join(""), p, e: 4 });

/** A body: its rim in `metal`, its field in `enamel` stepped down by a bevel. */
const body = (outer: string, field: string, metal: CrestMaterial, enamel: BadgePaint): BadgeLayer[] => [
  { d: outer, p: metal, e: 8 },
  { d: field, p: enamel, bevel: metal },
];

// The silhouettes, on the 512 grid, their axis at x 256: every one about 320 wide, so each step's change shows.
const SHIELD_SIDES = (w: number, y: number, foot: number) => `V${y}C${256 + w} ${y + 110} ${256 + w * 0.52} ${foot - 30} 256 ${foot}C${256 - w * 0.52} ${foot - 30} ${256 - w} ${y + 110} ${256 - w} ${y}z`;
const HEATER = "M96 120Q256 92 416 120" + SHIELD_SIDES(160, 250, 452);
const HEATER_FIELD = "M134 152Q256 132 378 152" + SHIELD_SIDES(122, 252, 412);
const POINTED = "M96 136C180 136 220 112 256 62C292 112 332 136 416 136" + SHIELD_SIDES(160, 252, 456);
const POINTED_FIELD = "M134 170C196 168 232 150 256 116C280 150 316 168 378 170" + SHIELD_SIDES(122, 254, 414);
const CRESTED = "M96 108L176 136L256 64L336 136L416 108" + SHIELD_SIDES(160, 252, 458);
const CRESTED_FIELD = "M134 158L184 174L256 114L328 174L378 158" + SHIELD_SIDES(122, 254, 416);
const HORNED = "M80 84L156 132Q256 108 356 132L432 84L416 252C416 362 340 426 256 462C172 426 96 362 96 252z";
const HORNED_FIELD = "M132 150L170 172Q256 152 342 172L380 150V256C378 342 318 396 256 422C194 396 134 342 134 256z";
const CRYSTAL = "M256 44L424 196L256 470L88 196z";
const CRYSTAL_FIELD = "M256 96L370 200L256 412L142 200z";

// The ornaments.
const RIBBON = "M90 378Q256 426 422 378L408 448Q256 492 104 448z";
const RIBBON_TAIL = "M112 398L40 404L70 436L44 472L124 460z";
const CROWN = (y: number, s: number) => {
  const x = (v: number) => r(256 + (v - 256) * s);
  const h = (v: number) => r(y - v * s);
  return `M${x(176)} ${y}L${x(160)} ${h(76)}L${x(212)} ${h(42)}L256 ${h(104)}L${x(300)} ${h(42)}L${x(352)} ${h(76)}L${x(336)} ${y}z`;
};
const crown = (y: number, s: number, metal: CrestMaterial, gems: BadgePaint[]): BadgeLayer[] => [
  { d: CROWN(y, s), p: metal, e: 8 },
  { d: `M${r(256 - 84 * s)} ${y - r(26 * s)}h${r(168 * s)}v${r(30 * s)}h-${r(168 * s)}z`, p: metal, e: 6 },
  rivets([-96, 0, 96].map((dx, i) => [256 + dx * s, y - (i === 1 ? 112 : 84) * s]), r(16 * s), "light"),
  // The band's gems, one path per stone's tone.
  ...[...new Set(gems)].map((g) => rivets(gems.flatMap((h, i) => (h === g ? [[256 + (i - (gems.length - 1) / 2) * 56 * s, y - 11 * s] as [number, number]] : [])), r(12 * s), g)),
];

/** The nine badges, Wood to Grand Master, back to front. */
export const BADGES: Record<LeagueId, BadgeModel> = {
  // A round wooden buckler: planks, an iron boss, four nails.
  wood: {
    field: circle(256, 256, 124),
    ornaments: [],
    layers: [
      ...body(circle(256, 256, 162), circle(256, 256, 124), "wood", "wood"),
      { d: "M210 144h10v224h-10zM292 144h10v224h-10z", p: "ink", o: 0.35 },
      ...stud(256, 256, 44, "iron"),
      rivets([45, 135, 225, 315].map((a) => at(256, 256, 143, a)), 9, "iron"),
    ],
  },
  // An iron octagon: a rivet at each corner, a dark field, a diamond boss.
  iron: {
    field: ngon(8, 128, -67.5),
    ornaments: [],
    layers: [
      ...body(ngon(8, 172, -67.5), ngon(8, 128, -67.5), "iron", "obsidian"),
      rivets(Array.from({ length: 8 }, (_, i) => at(256, 256, 150, -67.5 + 45 * i)), 10, "silver"),
      { d: ngon(4, 64), p: "iron", e: 8 },
      { d: "M256 192L320 256L256 256z", p: "light", o: 0.3 },
    ],
  },
  // A bronze heater shield: green enamel, an amber stone, studs at its corners.
  bronze: {
    field: HEATER_FIELD,
    ornaments: [],
    layers: [...body(HEATER, HEATER_FIELD, "bronze", "green"), rivets([[118, 136], [394, 136]], 12, "gold"), ...stud(256, 266, 50, "orange")],
  },
  // A silver shield pointed at its top, small wings, blue enamel, a cut sapphire.
  silver: {
    field: POINTED_FIELD,
    ornaments: ["wings"],
    layers: [...wings(4, 150, 236, 90, 124, 17, "silver"), ...body(POINTED, POINTED_FIELD, "silver", "blue"), ...gem(256, 268, 58, "blue")],
  },
  // A gold shield with a crested top, a laurel round it, red enamel, a cut ruby, a gold star on its crest.
  gold: {
    field: CRESTED_FIELD,
    ornaments: ["laurel", "star"],
    layers: [
      { d: laurel(196, 98, 226, 7, 60), p: "gold", e: 5, m: true },
      ...body(CRESTED, CRESTED_FIELD, "gold", "red"),
      ...gem(256, 274, 60, "red"),
      { d: star(5, 40, 17, 256, 70), p: "gold", e: 6 },
    ],
  },
  // Emerald: a platinum hexagon in a fuller laurel, teal enamel, a ruby, a banner across its foot.
  emerald: {
    field: ngon(6, 144),
    ornaments: ["laurel", "banner"],
    layers: [
      { d: laurel(212, 94, 240, 8, 66), p: "platinum", e: 5, m: true },
      { d: RIBBON_TAIL, p: "red", e: 6, m: true },
      ...body(ngon(6, 192), ngon(6, 144), "platinum", "teal"),
      ...gem(256, 236, 62, "red"),
      { d: RIBBON, p: "red", e: 6 },
    ],
  },
  // A cut crystal set in platinum, its facets lit, ice wings, a blue banner.
  diamond: {
    field: CRYSTAL_FIELD,
    ornaments: ["wings", "banner"],
    layers: [
      ...wings(5, 168, 214, 100, 160, 19, "platinum"),
      { d: RIBBON_TAIL, p: "blue", e: 6, m: true },
      ...body(CRYSTAL, CRYSTAL_FIELD, "platinum", "ice"),
      { d: "M256 96L142 200H256z", p: "light", o: 0.5 },
      { d: "M256 200H370L256 412z", p: "ink", o: 0.22 },
      { d: "M256 200L142 200L256 412z", p: "light", o: 0.15 },
      { d: star(4, 34, 7, 212, 160), p: "light", o: 0.95 },
      { d: RIBBON, p: "blue", e: 6 },
    ],
  },
  // Obsidian in a horned gold shield, great gold wings, a ruby, a gold crown, a red banner.
  master: {
    field: HORNED_FIELD,
    ornaments: ["wings", "banner", "crown"],
    layers: [
      ...wings(6, 168, 220, 104, 178, 20, "gold"),
      { d: RIBBON_TAIL, p: "red", e: 6, m: true },
      ...body(HORNED, HORNED_FIELD, "gold", "obsidian"),
      ...gem(256, 270, 64, "red"),
      ...crown(140, 0.9, "gold", ["red", "blue", "red"]),
      { d: RIBBON, p: "red", e: 6 },
    ],
  },
  // The same, red-enamelled, on a golden burst, wider wings, a diamond, gems on its horns, a taller jewelled crown, a blue banner.
  grandmaster: {
    field: HORNED_FIELD,
    ornaments: ["burst", "wings", "banner", "crown"],
    layers: [
      { d: star(12, 262, 150, 256, 240), p: "gold", e: 6 },
      ...wings(7, 168, 220, 110, 192, 20, "gold"),
      { d: RIBBON_TAIL, p: "blue", e: 6, m: true },
      ...body(HORNED, HORNED_FIELD, "gold", "red"),
      ...gem(256, 276, 66, "ice"),
      ...stud(104, 116, 16, "blue"),
      ...stud(408, 116, 16, "blue"),
      ...crown(146, 1.15, "gold", ["blue", "red", "green", "red", "blue"]),
      { d: RIBBON, p: "blue", e: 6 },
    ],
  },
};

const LIGHT = "var(--game-light)";
const INK = "var(--game-ink)";
const tint = (base: string, share: number, toward: string) => `color-mix(in oklab,${base} ${share}%,${toward})`;
const isMaterial = (p: BadgePaint): p is CrestMaterial => p in MATERIAL_BASES;
/** A paint's base: a material's, a game icon's tone, or the teal mixed from their blue and green. */
const baseOf = (p: BadgePaint) =>
  isMaterial(p) ? MATERIAL_BASES[p].replace(/, /g, ",") : p === "teal" ? tint("var(--game-blue)", 55, "var(--game-green)") : `var(--game-${p})`;

/** A paint's stops: a metal's sheen (lit top, a dark band past the middle, light thrown back at its foot), wood's plain fall, a gem's glow. */
function stops(p: BadgePaint): [number, string][] {
  const b = baseOf(p);
  if (p === "wood") return [[0, tint(b, 70, LIGHT)], [1, tint(b, 70, INK)]];
  if (isMaterial(p)) return [[0, tint(b, 35, LIGHT)], [0.42, b], [0.56, tint(b, 62, INK)], [0.82, b], [1, tint(b, 60, LIGHT)]];
  return [[0, tint(b, 60, LIGHT)], [0.5, b], [1, tint(b, 50, INK)]];
}

/** The outline's width on the 512 grid: about 1 px outside the badge at 24 px, 4 px at 96. */
export const BADGE_OUTLINE = 44;
const DROP = 22;
/** The gloss: the field's upper part, under a soft curve. */
const GLOSS = "M0 0H512V196Q256 262 0 196z";

export type BadgeCrestProps = Omit<CrestArtProps, "division">;

/**
 * A league's badge in the fourth study (issue 854): its own silhouette and ornaments, metallic gradients, a bevel, an enamelled field
 * under a gloss, cut gems, a thick dark outline round the whole and a shadow. One SVG of its own paths: the badge drawn once in its
 * `<defs>` and used three times (the shadow, the outline, the colours, the first two inked by the `--s` and `--w` they hand down),
 * each mirrored part drawn once. Storybook only, until the owner's yes; `LeagueCrest` draws the chosen study in issue 854's second
 * pull request.
 */
export function BadgeCrest({ league, size = "md", label, className }: BadgeCrestProps) {
  const { layers, field } = BADGES[league];
  const rem = SIZE_REM[size];
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const grads = [...new Set(layers.flatMap((l) => (l.p === "light" || l.p === "ink" ? [] : [l.p])))];
  const bevels = [...new Set(layers.flatMap((l) => (l.bevel ? [l.bevel] : [])))];
  const fill = (p: BadgePaint) => (p === "light" ? LIGHT : p === "ink" ? INK : `url(#${id}${p})`);
  const layer = (l: BadgeLayer, i: number) => {
    const style: Record<string, string> = { fill: `var(--s,${fill(l.p)})` };
    if (l.bevel) Object.assign(style, { stroke: `var(--s,url(#${id}r${l.bevel}))`, strokeWidth: "var(--w,22)" });
    else if (l.e) Object.assign(style, { stroke: `var(--s,var(--e${l.p}))`, strokeWidth: `var(--w,${l.e})` });
    const path = <path key={i} id={l.m ? `${id}${i}` : undefined} d={l.d} style={style} opacity={l.o} />;
    return l.m ? [path, <use key={`${i}m`} href={`#${id}${i}`} transform="matrix(-1 0 0 1 512 0)" />] : [path];
  };
  // Each paint's edge colour, named once.
  const edges = Object.fromEntries([...new Set(layers.flatMap((l) => (l.e ? [l.p] : [])))].map((p) => [`--e${p}`, tint(baseOf(p), 55, INK)]));
  const pass = (s: string, w: number) => ({ "--s": s, "--w": w }) as CSSProperties;
  return (
    <svg
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      viewBox="0 0 512 512"
      width="1em"
      height="1em"
      overflow="visible"
      focusable="false"
      data-slot="badge-crest"
      data-league={league}
      className={cn("inline-block shrink-0 align-[-0.125em]", className)}
      style={rem === null ? undefined : { fontSize: `${rem}rem` }}
    >
      <defs>
        {grads.map((p) =>
          isMaterial(p) ? (
            <linearGradient key={p} id={`${id}${p}`} x2="0" y2="1">
              {stops(p).map(([o, c]) => (
                <stop key={o} offset={o} style={{ stopColor: c }} />
              ))}
            </linearGradient>
          ) : (
            <radialGradient key={p} id={`${id}${p}`} cx=".38" cy=".3" r=".8">
              {stops(p).map(([o, c]) => (
                <stop key={o} offset={o} style={{ stopColor: c }} />
              ))}
            </radialGradient>
          ),
        )}
        {bevels.map((m) => (
          <linearGradient key={m} id={`${id}r${m}`} href={`#${id}${m}`} y1="1" y2="0" />
        ))}
        <g id={`${id}k`} strokeLinejoin="round" style={{ stroke: "var(--s,none)", strokeWidth: "var(--w,0)", ...edges }}>
          {layers.flatMap(layer)}
        </g>
        <clipPath id={`${id}c`}>
          <path d={field} />
        </clipPath>
      </defs>
      {/* The shadow, then the outline: the whole badge inked and widened, so it reads as one shape on any ground. */}
      <use href={`#${id}k`} transform={`translate(0 ${DROP})`} opacity={0.4} style={pass(INK, BADGE_OUTLINE)} />
      <use href={`#${id}k`} style={pass(INK, BADGE_OUTLINE)} />
      <use href={`#${id}k`} />
      <path d={GLOSS} clipPath={`url(#${id}c)`} style={{ fill: LIGHT }} opacity={0.22} />
    </svg>
  );
}
