import type { CSSProperties } from "react";

/**
 * A tile's angled render cut to the tile (COLLECTION-PAGE's stage, the chests' cards): the build's renders keep a navy backdrop behind
 * the tile, and every render has the same framing, so one outline cuts it: the hull of the 38 renders' silhouettes (the backdrop's own
 * shades left out), drawn 3.5 % in toward the tile's middle so its drop shadow on the navy and its anti-aliased rim stay outside.
 * Inline: the one stylesheet has no room to spare. A module of its own, so the first load (which draws tiles) does not carry it.
 */
export const TILE_CUT: CSSProperties = {
  clipPath: "polygon(6.6% 46.6%, 9.6% 41.5%, 13.5% 36.3%, 37.1% 11.3%, 44.6% 7.7%, 56.7% 7.7%, 81.9% 24.6%, 92.3% 35.1%, 91.9% 43.9%, 89.2% 48%, 58.1% 83.3%, 57.2% 83.3%, 7.4% 55.9%, 6.9% 53.1%)",
};
