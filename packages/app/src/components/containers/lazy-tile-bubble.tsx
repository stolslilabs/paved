import { lazy } from "react";

/** The bubble's own chunk (`tile-bubble.tsx`): it loads at the first placed tile, not with the board. */
export const LazyTileBubble = lazy(() => import("./tile-bubble"));

/** The home editor's bubble (`village-bubble.tsx`, EDIT-VILLAGE): its own chunk, at the first tile in hand. */
export const LazyVillageBubble = lazy(() => import("./village-bubble"));

/** The press bubble's chunk (`press-bubble.tsx`, #799): asked for once a press can show it, so it is in by the first one. */
export const loadPressBubble = () => import("./press-bubble");
export const LazyPressBubble = lazy(loadPressBubble);
