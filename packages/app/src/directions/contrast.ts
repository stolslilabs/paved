import { hexToRgb, type Rgb } from "../styles/color-math";
import { STATES, type Palette } from "./palettes";

const linear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** WCAG 2 contrast ratio of two hex colours. */
export function contrastHex(a: string, b: string): number {
  const [hi, lo] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `over` painted on `under` at `alpha`, as the browser composites it: a hex colour. */
export function mix(under: string, over: string, alpha: number): string {
  const u = hexToRgb(under);
  const o = hexToRgb(over);
  return `#${u.map((c, i) => Math.round(c + (o[i]! - c) * alpha).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export type StateName = keyof typeof STATES | "rest";
export const STATE_NAMES: readonly StateName[] = ["rest", "hover", "active", "pressed"];

/** A surface under a state's white overlay. */
export function underState(surface: string, state: StateName): string {
  return state === "rest" ? surface : mix(surface, "#FFFFFF", STATES[state]);
}

export interface Check {
  label: string;
  state: StateName;
  fg: string;
  bg: string;
  ratio: number;
  /** The WCAG threshold this pair is held to: 4.5 for text; 3 under the pressed overlay, which lasts a tap (the steady states are held to 4.5). */
  min: number;
}

/**
 * Every pair that carries text or an icon: the text, the muted text and the primary colour on the surfaces a button or a nav
 * item sits on (the page, a card, a raised part) at rest and under each state's white overlay, and the primary button's text
 * on its fill.
 */
export function checks(p: Palette): Check[] {
  const out: Check[] = [];
  const pair = (label: string, state: StateName, fg: string, bg: string) => out.push({ label, state, fg, bg, ratio: contrastHex(fg, bg), min: state === "pressed" ? 3 : 4.5 });
  for (const [surfaceName, surface] of [["page", p.bg], ["card", p.surface], ["raised", p.raised]] as const) {
    for (const state of STATE_NAMES) {
      const bg = underState(surface, state);
      pair(`text on ${surfaceName}`, state, p.text, bg);
      pair(`muted on ${surfaceName}`, state, p.muted, bg);
      // A selected raised part (a chip, a segment) keeps its text colour and shows the selection by a ring, never by primary text.
      if (surfaceName !== "raised") pair(`primary on ${surfaceName}`, state, p.primary, bg);
    }
  }
  // The second voices (accent, danger) on the same surfaces, and the glass card of C (white 6% over the page).
  const glass = mix(p.bg, "#FFFFFF", 0.06);
  for (const [surfaceName, surface] of [["page", p.bg], ["card", p.surface], ["glass", glass]] as const) {
    for (const state of STATE_NAMES) {
      const bg = underState(surface, state);
      pair(`accent on ${surfaceName}`, state, p.accent, bg);
      pair(`danger on ${surfaceName}`, state, p.danger, bg);
    }
  }
  // A chip (white 10%) nested on a card under each state: its text colours on the card's overlay plus its own.
  for (const [surfaceName, surface] of [["card", p.surface], ["glass", glass]] as const) {
    for (const state of STATE_NAMES) {
      const bg = mix(underState(surface, state), "#FFFFFF", 0.1);
      pair(`chip muted on ${surfaceName}`, state, p.muted, bg);
    }
  }
  for (const state of STATE_NAMES) pair("on-primary on primary", state, p.onPrimary, underState(p.primary, state));
  // The accent chip is a solid accent fill with dark text, like the primary one.
  pair("on-primary on accent chip", "rest", p.onPrimary, p.accent);
  return out;
}
