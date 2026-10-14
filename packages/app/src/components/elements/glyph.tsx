import type { SVGProps } from "react";
import { cn } from "../../lib/utils";

/**
 * The icon slot of the game components. F4's `Icon` (Font Awesome, section 8) is not merged: these stroke glyphs hold
 * the place, one name per use, and the swap is a change of this file only.
 */
const PATHS = {
  back: "m15 5-7 7 7 7",
  chevron: "m9 5 7 7-7 7",
  play: "M7 4.5v15l12.5-7.5z",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3",
  crown: "M3 19h18M4.5 8l4 4L12 5l3.5 7 4-4L18 16H6z",
  tiles: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  rotate: "M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5",
  check: "m5 12.5 4.5 4.5L19 7",
  discard: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  surrender: "M5 21V4M5 4h11l-2 4 2 4H5",
  lock: "M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7",
  book: "M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h8",
  home: "M3 11 12 3l9 8M5 9.5V21h14V9.5",
  ranks: "M5 21V11M12 21V4M19 21v-7",
  quests: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  vault: "M3 7h18v14H3zM3 7l3-4h12l3 4M12 11v6",
  settings:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
  star: "m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4l-5.6 2.9 1.1-6.2L3 9.7l6.2-.9z",
  wallet: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3zM3 7V5a2 2 0 0 1 2-2h11M16.5 13.5h.01",
  boost: "M12 20V5M5.5 11.5 12 5l6.5 6.5",
  warning: "M12 3 2 20h20zM12 10v4M12 17h.01",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01",
  storage: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  forest: "M12 3 6.5 11h3L5 17h14l-4.5-6h3zM12 17v4",
  road: "M9 3 6 21M15 3l3 18M12 5v2.5M12 11v2.5M12 17v2.5",
  city: "M3 21V10l5-3v14M8 21V4l7 3.5V21M15 21v-9l6 2.5V21M2 21h20",
  wonder: "M12 2.5 15 8h-6zM8 8h8v13H8zM5 21h14M11 13h2",
} as const;

export type GlyphName = keyof typeof PATHS;

export const GLYPHS = Object.keys(PATHS) as GlyphName[];

export function Glyph({ name, className, ...props }: { name: GlyphName } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-glyph={name}
      className={cn("size-5 shrink-0", className)}
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
