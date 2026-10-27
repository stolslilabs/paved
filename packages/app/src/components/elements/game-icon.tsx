import { cva, type VariantProps } from "class-variance-authority";
import { Fragment, useId } from "react";
import { cn } from "../../lib/utils";
import { GAME_ICON_SHAPES, type GameIconName } from "./game-icon-shapes";

export type { GameIconName } from "./game-icon-shapes";

/** The palette (theme.css, 3f): each tone one base, mixed into a lit top, a shaded foot and an outline. `current` takes the text's colour. */
export const GAME_TONES = ["gold", "steel", "red", "blue", "green", "wood", "stone", "paper", "rose", "light", "current"] as const;
export type GameTone = (typeof GAME_TONES)[number];

/**
 * The looks side by side in Storybook for the owner's pick (issue 844). All four keep the thick dark outline and the shadow under the
 * icon; they differ in the fill:
 * - `relief`: a soft vertical gradient (lit top, shaded foot) and a white light along each part's upper edges;
 * - `gloss`: a hard two-step fill, the upper half lit and the lower in the body's tone, the light on the upper half;
 * - `toon`: one flat tone per part, cel style.
 */
export const GAME_LOOKS = ["relief", "gloss", "toon"] as const;
export type GameLook = (typeof GAME_LOOKS)[number];

/**
 * Each icon's parts (the subpaths of `game-icon-shapes.ts`, in order) and their tones: the default colour per icon (issue 844's open
 * point 2: the swords steel and gold, the trophy gold, the shield blue, the gift red, the store wood). Consecutive parts of one
 * tone are drawn as one path, so a hole (the gear's, the shield's half) stays a hole. `extra` parts are drawn for Paved over the
 * icon (the gift's ribbon, which the outline would fill).
 */
const PARTS: Record<GameIconName, { tones: readonly GameTone[]; extra?: readonly { d: string; tone: GameTone }[] }> = {
  gear: { tones: ["stone", "stone"] },
  gift: { tones: ["gold", "gold", "gold", "red", "red"], extra: [{ d: "M228 288h56v224h-56z", tone: "gold" }] },
  hammer: { tones: ["steel", "wood"] },
  house: { tones: ["wood"] },
  "piggy-bank": { tones: ["gold", "rose", "rose"] },
  plus: { tones: ["light"] },
  scroll: { tones: ["wood", "paper", "paper"] },
  "shield-halved": { tones: ["blue", "blue"] },
  store: { tones: ["red", "wood"] },
  swords: { tones: ["gold", "steel", "steel", "gold"] },
  trophy: { tones: ["gold", "gold", "gold"] },
};

/** The outline's width in the icons' units (512 to the em): about 1.4 px outside the shape at 20 px, 3.4 at 48. */
const OUTLINE = 72;
/** The shadow's drop, and the depth of the light along the upper edges. */
const DROP = 28;
const RIM = 22;

/** Literal classes, so Tailwind sees them: the em, as `Icon` (12 to 48 px), and 64. The box is Font Awesome's fixed width, 1.25em. */
const gameIconVariants = cva("inline-block h-[1em] w-[1.25em] shrink-0 overflow-visible align-[-0.125em]", {
  variants: {
    size: {
      xs: "text-[0.75rem]",
      sm: "text-[1rem]",
      md: "text-[1.25rem]",
      lg: "text-[1.5rem]",
      xl: "text-[2rem]",
      "2xl": "text-[3rem]",
      "3xl": "text-[4rem]",
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
  look?: GameLook;
  /** The accessible name. Without it the icon is decorative and hidden from assistive technology. */
  label?: string;
  className?: string;
}

/** A tone's step, mixed from its base (theme.css, 3f): the lit top toward the light, the foot and the outline toward the ink. */
function paint(tone: GameTone, step: "hi" | "mid" | "lo" | "edge"): string {
  const base = tone === "current" ? "currentColor" : `var(--game-${tone})`;
  if (step === "mid") return base;
  const [share, toward] = { hi: [55, "--game-light"], lo: [72, "--game-ink"], edge: [20, "--game-ink"] }[step];
  return `color-mix(in oklab, ${base} ${share}%, var(${toward}))`;
}

/** Consecutive parts of one tone joined into one path. */
function groups(name: GameIconName, tone: GameTone | undefined): { d: string; tone: GameTone }[] {
  const out: { d: string; tone: GameTone }[] = [];
  const { tones, extra = [] } = PARTS[name];
  GAME_ICON_SHAPES[name].parts.forEach((d, i) => {
    const t = tone ?? tones[i] ?? tones[0]!;
    const last = out[out.length - 1];
    if (last && last.tone === t) last.d += d;
    else out.push({ d, tone: t });
  });
  return [...out, ...extra.map((e) => ({ d: e.d, tone: tone ?? e.tone }))];
}

/**
 * A game icon (issue 844), in the spirit of Supercell's: Font Awesome's shape, each part in its own tone, with a thick dark outline, a
 * lit fill, a light on its upper parts and a shadow under it. One SVG of its own paths, bundled with the app: it draws at the first
 * paint (no script, no request), crisp at any size. Its box is `Icon`'s fixed width (1.25em by 1em), so it takes a flat icon's
 * place; the outline and the shadow overflow the box a little, as a drop shadow would. Elsewhere `Icon` stays flat (text-sized
 * icons in lists, settings, forms).
 */
export function GameIcon({ name, tone, look = "relief", size, label, className }: GameIconProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const shape = GAME_ICON_SHAPES[name];
  const parts = groups(name, tone);
  const tones = [...new Set(parts.map((p) => p.tone))];
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  const fill = (t: GameTone) => (look === "toon" ? paint(t, "mid") : `url(#${id}-${t})`);

  return (
    <svg
      {...a11y}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${(shape.width - 640) / 2} 0 640 512`}
      focusable="false"
      data-slot="game-icon"
      data-icon={name}
      data-look={look}
      className={cn(gameIconVariants({ size }), className)}
    >
      <defs>
        {look !== "toon" &&
          tones.map((t) => (
            <linearGradient key={t} id={`${id}-${t}`} x1="0" y1="0" x2="0" y2="1">
              {look === "gloss" ? (
                <>
                  <stop offset="0" style={{ stopColor: paint(t, "hi") }} />
                  <stop offset="0.5" style={{ stopColor: paint(t, "hi") }} />
                  <stop offset="0.5" style={{ stopColor: paint(t, "mid") }} />
                  <stop offset="1" style={{ stopColor: paint(t, "lo") }} />
                </>
              ) : (
                <>
                  <stop offset="0" style={{ stopColor: paint(t, "hi") }} />
                  <stop offset="0.45" style={{ stopColor: paint(t, "mid") }} />
                  <stop offset="1" style={{ stopColor: paint(t, "lo") }} />
                </>
              )}
            </linearGradient>
          ))}
        {look === "relief" &&
          parts.map((p, i) => (
            // The light along the upper edges: the part, less itself moved down.
            <mask key={i} id={`${id}-rim${i}`} maskUnits="userSpaceOnUse" x="-64" y="-64" width="704" height="640">
              <path d={p.d} fill="white" />
              <path d={p.d} fill="black" transform={`translate(0 ${RIM})`} />
            </mask>
          ))}
        {look === "gloss" && (
          <clipPath id={`${id}-top`}>
            <rect x="-64" y="-64" width="704" height={64 + 230} />
          </clipPath>
        )}
      </defs>
      {/* The shadow under the icon: the whole shape, outline included, dropped. */}
      <g transform={`translate(0 ${DROP})`} style={{ fill: "var(--game-shadow)", stroke: "var(--game-shadow)" }} strokeWidth={OUTLINE} strokeLinejoin="round">
        {parts.map((p, i) => (
          <path key={i} d={p.d} />
        ))}
      </g>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {/* The outline: the part stroked behind its own fill, so only its outer half shows (and it parts the part from those before). */}
          <path d={p.d} style={{ fill: paint(p.tone, "edge"), stroke: paint(p.tone, "edge") }} strokeWidth={OUTLINE} strokeLinejoin="round" />
          <path d={p.d} style={{ fill: fill(p.tone) }} />
          {look === "relief" && <path d={p.d} mask={`url(#${id}-rim${i})`} style={{ fill: "var(--game-shine)" }} />}
          {look === "gloss" && <path d={p.d} clipPath={`url(#${id}-top)`} opacity={0.25} style={{ fill: "var(--game-shine)" }} />}
        </Fragment>
      ))}
    </svg>
  );
}
