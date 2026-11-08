import { cva, type VariantProps } from "class-variance-authority";
import { useId } from "react";
import { cn } from "../../lib/utils";
import { GAME_ICON_SHAPES, type GameIconName } from "./game-icon-shapes";

export type { GameIconName } from "./game-icon-shapes";

/** The palette (theme.css, 3f): each tone one base, mixed into a lit top, a shaded foot and an outline. `current` takes the text's colour. */
export type GameTone =
  | "gold"
  | "steel"
  | "red"
  | "blue"
  | "green"
  | "wood"
  | "stone"
  | "rose"
  | "orange"
  | "ice"
  | "sprout"
  | "silver"
  | "light"
  | "current";

/** An icon's tones, one per part of its shape. */
export interface ReliefLook {
  tones: readonly GameTone[];
}

/**
 * Each icon's parts (the subpaths of `game-icon-shapes.ts`, in order) and their tones (issue 844's open point 2). Consecutive parts of
 * one tone are drawn as one path, so a hole stays a hole. The village's house-tree (issue 870): its tree green, its house wood.
 */
const PARTS: Record<GameIconName, ReliefLook> = {
  "house-tree": { tones: ["green", "wood"] },
};

/** The outline's width in the icons' units (512 to the em): about 1.4 px outside the shape at 20 px, 3.4 at 48. */
export const OUTLINE = 72;
/** The shadow's drop, and the depth of the light along the upper edges. */
export const DROP = 28;
export const RIM = 22;

/** Literal classes, so Tailwind sees them: the em, as `Icon` (12 to 48 px). The box (`iconFrame`) is Font Awesome's fixed width. */
const gameIconVariants = cva("inline-block shrink-0 align-[-0.125em]", {
  variants: {
    size: {
      xs: "text-[0.75rem]",
      sm: "text-[1rem]",
    },
  },
  defaultVariants: { size: "sm" },
});

export type GameIconSize = NonNullable<VariantProps<typeof gameIconVariants>["size"]>;

export interface GameIconProps extends VariantProps<typeof gameIconVariants> {
  name: GameIconName;
  /** The accessible name. Without it the icon is decorative and hidden from assistive technology. */
  label?: string;
  className?: string;
}

/** The relief's own light and ink (theme.css, 3f), named once (the home's first load). */
const LIGHT = "var(--game-light)";
const INK = "var(--game-ink)";

/** A tone's step, mixed from its base (theme.css, 3f): the lit top toward the light, the foot and the outline toward the ink. */
export function paint(tone: GameTone, step: "hi" | "mid" | "lo" | "edge"): string {
  return mix(tone === "current" ? "currentColor" : tone === "light" ? LIGHT : `var(--game-${tone})`, step);
}

/** `paint`'s steps from any base colour (a league crest's `var(--league-*)`). */
export function mix(base: string, step: "hi" | "mid" | "lo" | "edge"): string {
  if (step === "mid") return base;
  const [share, toward] = ({ hi: [55, LIGHT], lo: [72, INK], edge: [20, INK] } as const)[step];
  return `color-mix(in oklab, ${base} ${share}%, ${toward})`;
}

/** A shape's parts in drawing order, consecutive parts of one tone joined into one path (a missing tone repeats the last). */
export function reliefParts(shape: { parts: readonly string[] }, { tones }: ReliefLook): { d: string; tone: GameTone }[] {
  const out: { d: string; tone: GameTone }[] = [];
  shape.parts.forEach((d, i) => {
    const t = tones[Math.min(i, tones.length - 1)]!;
    const last = out[out.length - 1];
    if (last && last.tone === t) last.d += d;
    else out.push({ d, tone: t });
  });
  return out;
}

/** A HUD icon's parts (`reliefParts`). */
export const iconParts = (name: GameIconName) => reliefParts(GAME_ICON_SHAPES[name], PARTS[name]);

/** The frame's own props: the icon's name (its `data-icon`) and its shape's width. */
type FrameProps = Omit<GameIconProps, "name"> & { name: string; width: number };

/** The SVG's frame: the icon's own attributes, its 640 by 512 box centred on the shape (Font Awesome's fixed width, 1.25em by 1em). */
function frameOf({ name, width, size, label, className }: FrameProps) {
  return {
    ...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true }),
    viewBox: `${(width - 640) / 2} 0 640 512`,
    width: "1.25em",
    height: "1em",
    overflow: "visible",
    focusable: "false" as const,
    "data-slot": "game-icon",
    "data-icon": name,
    className: cn(gameIconVariants({ size }), className),
  };
}

/** A HUD icon's frame (`frameOf`). */
export const iconFrame = ({ name, ...frame }: GameIconProps) => frameOf({ name, width: GAME_ICON_SHAPES[name].width, ...frame });

/** The shadow under the icon: the whole shape, outline included, dropped; one layer at low opacity, so overlaps do not darken. */
export function IconShadow({ parts }: { parts: { d: string }[] }) {
  return (
    <g transform={`translate(0 ${DROP})`} opacity={0.45} style={{ fill: INK, stroke: INK }} strokeWidth={OUTLINE} strokeLinejoin="round">
      {parts.map((p, i) => (
        <path key={i} d={p.d} />
      ))}
    </g>
  );
}

/** The outline: a part stroked behind its own fill, so only its outer half shows (and it parts the part from those before). */
export const outline = (p: { d: string; tone: GameTone }) => (
  <path d={p.d} style={{ fill: paint(p.tone, "edge"), stroke: paint(p.tone, "edge") }} strokeWidth={OUTLINE} strokeLinejoin="round" />
);

/**
 * A game icon (issue 844), in the spirit of Supercell's: Font Awesome's shape, each part in its own tone, with a thick dark outline, a
 * lit gradient (top light, foot shaded), a light along its upper edges and a shadow under it. One SVG of its own paths, bundled with
 * the app: it draws at the first paint (no script, no request), crisp at any size. Its box is `Icon`'s fixed width (1.25em by 1em),
 * so it takes a flat icon's place; the outline and the shadow overflow the box a little, as a drop shadow would. Elsewhere `Icon`
 * stays flat (text-sized icons in lists, settings, forms).
 * The owner picked this look, Relief, for the HUD (issue 844); the HUD's own painted icons (`UiIcon`) have taken its places since,
 * but the village's Found and notes and the categories (`WorldIcon`).
 */
export function GameIcon({ name, ...frame }: GameIconProps) {
  return <Relief name={name} width={GAME_ICON_SHAPES[name].width} parts={iconParts(name)} {...frame} />;
}

/** The relief's drawing of any shape's toned parts (`GameIcon`'s, and `WorldIcon`'s from their own shapes). */
export function Relief({ parts, ...frame }: FrameProps & { parts: { d: string; tone: GameTone }[] }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg {...frameOf(frame)}>
      <defs>
        {[...new Set(parts.map((p) => p.tone))].map((t) => (
          // Top to foot: x1, y1 and the first stop's offset are SVG's defaults (0), so they are not written (the home's first load).
          <linearGradient key={t} id={`${id}${t}`} x2="0" y2="1">
            <stop style={{ stopColor: paint(t, "hi") }} />
            <stop offset="0.45" style={{ stopColor: paint(t, "mid") }} />
            <stop offset="1" style={{ stopColor: paint(t, "lo") }} />
          </linearGradient>
        ))}
        {parts.map((p, i) => (
          // The light along the upper edges: the part, less itself moved down.
          <mask key={i} id={`${id}r${i}`} maskUnits="userSpaceOnUse" x="-320" y="-320" width="1280" height="1280">
            <path d={p.d} fill="white" />
            <path d={p.d} fill="black" transform={`translate(0 ${RIM})`} />
          </mask>
        ))}
      </defs>
      <IconShadow parts={parts} />
      {parts.map((p, i) => (
        <g key={i}>
          {outline(p)}
          <path d={p.d} fill={`url(#${id}${p.tone})`} />
          <path d={p.d} mask={`url(#${id}r${i})`} opacity={0.55} style={{ fill: LIGHT }} />
        </g>
      ))}
    </svg>
  );
}
