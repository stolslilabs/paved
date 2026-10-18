import { createContext, useContext, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import clsx from "clsx";
import { APP_ASSETS, APP_MANIFEST } from "../mocks/assets";
import { Icon } from "../components/ui/icon";
import { DIRECTIONS, STATES, type DirectionId } from "./palettes";
import banner from "../../../../assets/banner.svg";
import logo from "../../../../assets/logo.svg";

/*
 * The kit of the three directions (#537, PR 1): the primitives a screen is made of (card, button, chip, switch, brand, tile art),
 * drawn once per direction. A screen asks the kit and never names a direction; the direction is a context and a set of CSS
 * variables on its root (`--d-*`). No `cn`/tailwind-merge here: the overlay classes below must all survive.
 */

const Dir = createContext<DirectionId>("a");
export const useDir = () => useContext(Dir);

/** The root of a direction: its tokens as CSS variables, the page colour, the font. A story or a screen sits inside one. */
export function DirectionRoot({ id, children, className }: { id: DirectionId; children: ReactNode; className?: string }) {
  const p = DIRECTIONS[id].palette;
  const vars = {
    "--d-bg": p.bg,
    "--d-surface": p.surface,
    "--d-raised": p.raised,
    "--d-line": p.line,
    "--d-text": p.text,
    "--d-muted": p.muted,
    "--d-primary": p.primary,
    "--d-on-primary": p.onPrimary,
    "--d-accent": p.accent,
    "--d-danger": p.danger,
    "--d-shadow": p.shadow,
    // White with transparency: the same three values for every button and nav item of every direction.
    "--d-hover": `rgb(255 255 255 / ${STATES.hover})`,
    "--d-active": `rgb(255 255 255 / ${STATES.active})`,
    "--d-pressed": `rgb(255 255 255 / ${STATES.pressed})`,
  } as CSSProperties;
  return (
    <Dir.Provider value={id}>
      <div data-direction={id} style={vars} className={clsx("min-h-dvh bg-(--d-bg) font-sans text-(color:--d-text) antialiased", className)}>
        {children}
      </div>
    </Dir.Provider>
  );
}

/**
 * The interaction states, one rule for every button and nav item: a white overlay painted over the part's own colour
 * (`background-image` over `background-color`), `--ov` set by the state. Hover 10%, selected 15% (`data-on`), pressed 20%.
 * `data-force` pins a state for the States story and the captures.
 */
export const OVERLAY = clsx(
  "bg-[linear-gradient(var(--ov),var(--ov))] [--ov:transparent] transition-[background-color,transform,box-shadow] duration-100",
  "hover:[--ov:var(--d-hover)] data-[on=true]:[--ov:var(--d-active)] data-[on=true]:hover:[--ov:var(--d-active)] active:[--ov:var(--d-pressed)] data-[on=true]:active:[--ov:var(--d-pressed)]",
  "data-[force=hover]:[--ov:var(--d-hover)] data-[force=active]:[--ov:var(--d-active)] data-[force=pressed]:[--ov:var(--d-pressed)]",
  "outline-none focus-visible:ring-2 focus-visible:ring-(--d-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--d-bg)",
);

export type Force = "hover" | "active" | "pressed";

export type Variant = "solid" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "square";

const VARIANT: Record<Variant, string> = {
  solid: "bg-(--d-primary) text-(color:--d-on-primary)",
  secondary: "bg-(--d-raised) text-(color:--d-text)",
  outline: "border border-white/35 text-(color:--d-text)",
  ghost: "text-(color:--d-text)",
  danger: "border border-(color:--d-danger) text-(color:--d-danger)",
};
const SIZE: Record<Size, string> = {
  sm: "h-10 px-3.5 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-6 text-base",
  square: "size-11",
};
/** The shape of a direction: its corner and its press. A sinks like a key; B is a pebble; C is glass. */
const SHAPE: Record<DirectionId, string> = {
  a: "rounded-[3px] font-bold tracking-wider uppercase shadow-[0_4px_0_var(--d-shadow)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--d-shadow)] data-[on=true]:translate-y-[3px] data-[on=true]:shadow-[0_1px_0_var(--d-shadow)]",
  b: "rounded-full font-semibold active:scale-[0.97]",
  c: "rounded-2xl font-medium active:scale-[0.97]",
};

export interface DButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Selected: the 15% overlay stays. */
  on?: boolean;
  /** Pin a state, for the States story. */
  force?: Force;
}

/** Every button of a direction: five variants, four sizes, and the states of the white overlay on each. */
export function DButton({ variant = "solid", size = "md", on, force, className, type = "button", ...rest }: DButtonProps) {
  const d = useDir();
  return (
    <button
      type={type}
      data-on={on ? "true" : undefined}
      data-force={force}
      aria-pressed={on === undefined ? undefined : on}
      className={clsx("inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap disabled:pointer-events-none disabled:opacity-50", OVERLAY, VARIANT[variant], SIZE[size], SHAPE[d], className)}
      {...rest}
    />
  );
}

/** A card's look, per direction. */
const CARD: Record<DirectionId, string> = {
  a: "rounded-[3px] border-2 border-(color:--d-raised) bg-(--d-surface) shadow-[5px_5px_0_var(--d-shadow)]",
  b: "rounded-[10px] bg-(--d-surface) outline-2 -outline-offset-[7px] outline-dashed outline-(--d-line)",
  c: "rounded-3xl border border-white/12 bg-white/6 backdrop-blur-xl shadow-[0_10px_40px_rgb(0_0_0/0.35)]",
};

export function DCard({ className, children }: { className?: string; children: ReactNode }) {
  const d = useDir();
  return (
    <div data-slot="card" className={clsx(CARD[d], className)}>
      {children}
    </div>
  );
}

/** A card that is a button (a mode, a row): the card's look and the same overlay states as every button. */
export function DCardButton({ on, force, className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean; force?: Force }) {
  const d = useDir();
  return (
    <button
      type={type}
      data-slot="card"
      data-on={on ? "true" : undefined}
      data-force={force}
      aria-pressed={on === undefined ? undefined : on}
      className={clsx("cursor-pointer text-left disabled:pointer-events-none disabled:opacity-50", OVERLAY, CARD[d], d === "a" && "active:translate-y-[3px] active:shadow-[2px_2px_0_var(--d-shadow)]", className)}
      {...rest}
    />
  );
}

/** A small label: a badge, a count. */
export function DChip({ children, tone = "plain", className }: { children: ReactNode; tone?: "plain" | "primary" | "accent"; className?: string }) {
  const d = useDir();
  const toneClass = { plain: "bg-white/10 text-(color:--d-muted)", primary: "bg-(--d-primary) text-(color:--d-on-primary)", accent: "bg-(--d-accent) text-(color:--d-on-primary)" }[tone];
  return <span className={clsx("inline-flex items-center gap-1 px-2.5 py-1 text-xs leading-none font-semibold tracking-wide uppercase", d === "a" ? "rounded-[2px]" : "rounded-full", toneClass, className)}>{children}</span>;
}

/** A switch: a button with the overlay states, a track and a knob. */
export function DSwitch({ checked, label, force, onChange }: { checked: boolean; label: string; force?: Force; onChange?: (next: boolean) => void }) {
  const d = useDir();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-on={checked ? "true" : undefined}
      data-force={force}
      onClick={() => onChange?.(!checked)}
      className={clsx("relative h-8 w-14 shrink-0 cursor-pointer", OVERLAY, d === "a" ? "rounded-[3px]" : "rounded-full", checked ? "bg-(--d-primary)" : "bg-(--d-raised) ring-1 ring-white/25")}
    >
      <span className={clsx("absolute top-1 size-6 transition-[left]", d === "a" ? "rounded-[2px]" : "rounded-full", checked ? "left-7 bg-(--d-on-primary)" : "left-1 bg-(--d-text)")} />
    </button>
  );
}

/** The art of a tile (256 px, the app's own files), pixel-crisp. */
export const TILE_KEYS = Object.keys(APP_MANIFEST.tiles["256"] ?? {}).sort();
export const tileUrl = (index: number) => `${APP_ASSETS}/${APP_MANIFEST.tiles["256"]![TILE_KEYS[index % TILE_KEYS.length]!]}`;

export function TileArt({ index, className }: { index: number; className?: string }) {
  return <img src={tileUrl(index)} alt="" draggable={false} style={{ imageRendering: "pixelated" }} className={clsx("aspect-square object-cover", className)} />;
}

/** The brand: A sets the banner (the extruded letters), B and C the mark and the name in the display font. */
export function Brand({ className }: { className?: string }) {
  const d = useDir();
  if (d === "a") return <img src={banner} alt="Paved" draggable={false} className={clsx("-my-4 h-16 w-auto self-start", className)} />;
  return (
    <span className={clsx("flex items-center gap-2", className)}>
      <img src={logo} alt="" draggable={false} className="size-10" />
      <span className="font-display text-2xl tracking-wider text-(color:--d-primary)">PAVED</span>
    </span>
  );
}

/** A heading in the display font (Almendra stays, owner decision). */
export function DTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={clsx("font-display text-2xl tracking-wide", className)}>{children}</h2>;
}

export const Muted = ({ children, className }: { children: ReactNode; className?: string }) => <span className={clsx("text-xs text-(color:--d-muted)", className)}>{children}</span>;

export { Icon };
