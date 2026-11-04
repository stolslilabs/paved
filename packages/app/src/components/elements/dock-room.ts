import { DOCK_ART } from "./ui-art";

// The room a page leaves the home's dock, which stays over it (HOME-DOCK, the owner's ask of 2026-11-04). A module apart from
// `ui-art.ts`, which the home's first load carries: only the pages, each in its own chunk, read it.

/** How far up the dock reaches from the screen's foot, the safe area aside, in CSS px: its parchment's top, and the PLAY medallion over it. */
export const DOCK_REACH_PX = Math.ceil((DOCK_ART.height - DOCK_ART.medallion.top) * DOCK_ART.scale);

/** The room a page under the dock leaves at its end, its bottom padding: the dock's reach, a gap, and the safe area. */
export const DOCK_CLEARANCE = `calc(${DOCK_REACH_PX}px + 1rem + env(safe-area-inset-bottom))`;

/**
 * A tap on the home's dock, which stays over the side panel and its sheets (`data-dock`, theme.css), is no tap outside them: the dock
 * opens its page in the panel (the route changes), it does not close it. Their `onInteractOutside`.
 */
export function keepForDock(event: Event) {
  if (event.target instanceof Element && event.target.closest("[data-dock]")) event.preventDefault();
}
