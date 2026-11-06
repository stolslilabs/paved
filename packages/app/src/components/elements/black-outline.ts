/**
 * A word outlined thick in the HUD's black (the owner's asks of 2026-11-06, the book's Take): the dock labels' outline (`app-nav.tsx`),
 * 2 px around and a drop under it, as a `text-shadow`. The painted art's own outline, so a figure beside a painting reads as part of
 * it: the chests' Take and the ends' pills (CHESTS-PAGE), the stake's amount and Confirm's word (PLAY-PAGE).
 */
export const BLACK_OUTLINE = [
  [-2, 0],
  [2, 0],
  [0, -2],
  [0, 2],
  [-1.5, -1.5],
  [1.5, -1.5],
  [-1.5, 1.5],
  [1.5, 1.5],
]
  .map(([x, y]) => `${x}px ${y}px var(--hud-outline)`)
  .concat("0 3px 2px var(--hud-outline)")
  .join(", ");
