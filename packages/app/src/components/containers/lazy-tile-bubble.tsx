import { lazy } from "react";

/**
 * The tile's actions' own chunk (`tile-bubble.tsx`, TILE-ACTIONS): it loads at the first placed tile, not with the board; the boards'
 * and the home editor's alike.
 */
export const LazyTileBubble = lazy(() => import("./tile-bubble"));

/**
 * The long press's chunk (`press-bubble.tsx`, #799; PRESS-BUILD: its button one of the tile actions', their shared parts in
 * `tile-action.tsx`): asked for once a press can show it, so it is in by the first one.
 */
export const loadPressBubble = () => import("./press-bubble");
export const LazyPressBubble = lazy(loadPressBubble);
