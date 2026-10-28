import { cva, type VariantProps } from "class-variance-authority";
import { useId } from "react";
import { cn } from "../../lib/utils";
import { GAME_ICON_SHAPES, type GameIconName } from "./game-icon-shapes";

export type { GameIconName } from "./game-icon-shapes";

/** The palette (theme.css, 3f): each tone one base, mixed into a lit top, a shaded foot and an outline. `current` takes the text's colour. */
export type GameTone = "gold" | "steel" | "red" | "blue" | "green" | "wood" | "stone" | "rose" | "light" | "current";

/** A rounded square behind the "+" (issue 845): the plates' green button, 1.75em across, past the icon's box on every side. */
const BUTTON = "M-64-192h576a160 160 0 0 1 160 160v576a160 160 0 0 1-160 160h-576a160 160 0 0 1-160-160v-576a160 160 0 0 1 160-160z";

/**
 * Each icon's parts (the subpaths of `game-icon-shapes.ts`, in order) and their tones: the default colour per icon (issue 844's open
 * point 2: the swords steel and gold, the trophy gold, the shield blue, the gift red, the store wood). Consecutive parts of one
 * tone are drawn as one path, so a hole (the gear's, the shield's half) stays a hole. Parts drawn for Paved go `under` the icon
 * (the "+"'s button) or `over` it (the gift's ribbon, which the outline would fill).
 */
const PARTS: Record<GameIconName, { tones: readonly GameTone[]; under?: string; over?: string }> = {
  gear: { tones: ["stone"] },
  gift: { tones: ["gold", "gold", "gold", "red"], over: "M228 288h56v224h-56z" },
  hammer: { tones: ["steel", "wood"] },
  house: { tones: ["wood"] },
  "piggy-bank": { tones: ["gold", "rose"] },
  plus: { tones: ["light"], under: BUTTON },
  scroll: { tones: ["wood", "light"] },
  "shield-halved": { tones: ["blue"] },
  store: { tones: ["red", "wood"] },
  swords: { tones: ["gold", "steel", "steel", "gold"] },
  trophy: { tones: ["gold"] },
};

/** The outline's width in the icons' units (512 to the em): about 1.4 px outside the shape at 20 px, 3.4 at 48. */
const OUTLINE = 72;
/** The shadow's drop, and the depth of the light along the upper edges. */
const DROP = 28;
const RIM = 22;

/** Literal classes, so Tailwind sees them: the em, as `Icon` (12 to 48 px). The box (`iconFrame`) is Font Awesome's fixed width. */
const gameIconVariants = cva("inline-block shrink-0 align-[-0.125em]", {
  variants: {
    size: {
      xs: "text-[0.75rem]",
      sm: "text-[1rem]",
      md: "text-[1.25rem]",
      lg: "text-[1.5rem]",
      xl: "text-[2rem]",
      "2xl": "text-[3rem]",
      /** The parent's font size (a plate's disc sets its own). */
      inherit: "",
    },
  },
  defaultVariants: { size: "md" },
});

export type GameIconSize = NonNullable<VariantProps<typeof gameIconVariants>["size"]>;

export interface GameIconProps extends VariantProps<typeof gameIconVariants> {
  name: GameIconName;
  /** One tone for every part (a league's crest in its colour: `current`); none keeps the icon's own colours. */
  tone?: GameTone;
  /** The accessible name. Without it the icon is decorative and hidden from assistive technology. */
  label?: string;
  className?: string;
}

/** A tone's step, mixed from its base (theme.css, 3f): the lit top toward the light, the foot and the outline toward the ink. */
export function paint(tone: GameTone, step: "hi" | "mid" | "lo" | "edge"): string {
  const base = tone === "current" ? "currentColor" : tone === "light" ? "var(--foreground)" : `var(--game-${tone})`;
  if (step === "mid") return base;
  const [share, toward] = ({ hi: [55, "foreground"], lo: [72, "background"], edge: [20, "background"] } as const)[step];
  return `color-mix(in oklab, ${base} ${share}%, var(--${toward}))`;
}

/** The icon's parts in drawing order, consecutive parts of one tone joined into one path (a missing tone repeats the last). */
export function iconParts(name: GameIconName, tone?: GameTone): { d: string; tone: GameTone }[] {
  const { tones, under, over } = PARTS[name];
  const out: { d: string; tone: GameTone }[] = under ? [{ d: under, tone: tone ?? "green" }] : [];
  const first = out.length;
  GAME_ICON_SHAPES[name].parts.forEach((d, i) => {
    const t = tone ?? tones[Math.min(i, tones.length - 1)]!;
    const last = out[out.length - 1];
    if (out.length > first && last!.tone === t) last!.d += d;
    else out.push({ d, tone: t });
  });
  return over ? [...out, { d: over, tone: tone ?? "gold" }] : out;
}

/** The SVG's frame: the icon's own attributes, its 640 by 512 box centred on the shape (Font Awesome's fixed width, 1.25em by 1em). */
export function iconFrame({ name, size, label, className }: Omit<GameIconProps, "tone">) {
  return {
    ...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true }),
    viewBox: `${(GAME_ICON_SHAPES[name].width - 640) / 2} 0 640 512`,
    width: "1.25em",
    height: "1em",
    overflow: "visible",
    focusable: "false" as const,
    "data-slot": "game-icon",
    "data-icon": name,
    className: cn(gameIconVariants({ size }), className),
  };
}

/** The shadow under the icon: the whole shape, outline included, dropped; one layer at low opacity, so overlaps do not darken. */
export function IconShadow({ parts }: { parts: { d: string }[] }) {
  return (
    <g transform={`translate(0 ${DROP})`} opacity={0.45} style={{ fill: "var(--background)", stroke: "var(--background)" }} strokeWidth={OUTLINE} strokeLinejoin="round">
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
 * stays flat (text-sized icons in lists, settings, forms). The other looks of the owner's pick are `game-icon-looks.tsx` (Storybook).
 * The owner picked this look, Relief, for the HUD (issue 844): the overlay buttons, the phone's bar, Play, Edit, Found, Settings, the
 * League control, the shield's plate and the plates' "+".
 */
export function GameIcon({ name, tone, ...frame }: GameIconProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const parts = iconParts(name, tone);
  return (
    <svg {...iconFrame({ name, ...frame })}>
      <defs>
        {[...new Set(parts.map((p) => p.tone))].map((t) => (
          <linearGradient key={t} id={`${id}${t}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: paint(t, "hi") }} />
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
          <path d={p.d} mask={`url(#${id}r${i})`} opacity={0.55} style={{ fill: "var(--foreground)" }} />
        </g>
      ))}
    </svg>
  );
}
