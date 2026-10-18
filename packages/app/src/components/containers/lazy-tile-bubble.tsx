import { lazy } from "react";

/** The bubble's own chunk (`tile-bubble.tsx`): it loads at the first placed tile, not with the board. */
export const LazyTileBubble = lazy(() => import("./tile-bubble"));
