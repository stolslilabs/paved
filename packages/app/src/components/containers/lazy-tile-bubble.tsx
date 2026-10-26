import { lazy } from "react";

/** The bubble's own chunk (`tile-bubble.tsx`): it loads at the first placed tile, not with the board. */
export const LazyTileBubble = lazy(() => import("./tile-bubble"));

/** The press bubble's chunk (`press-bubble.tsx`, #799): asked for once a press can show it, so it is in by the first one. */
export const loadPressBubble = () => import("./press-bubble");
export const LazyPressBubble = lazy(loadPressBubble);
