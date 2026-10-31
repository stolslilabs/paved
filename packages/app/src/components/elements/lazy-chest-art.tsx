import { lazy, Suspense } from "react";
import type { ChestArtProps } from "./chest-art";
import { CHEST_NAME } from "./chest-badge";
import { CHEST_ART_REM, CHEST_SPENT } from "./chest-designs";
import { ChestIcon } from "./chest-icon";

const ChestArt = lazy(() => import("./chest-art"));

/**
 * The chest's art (`ChestArt`) in its own chunk (issue 874's proposal 5), for the chest slots and the opening's modal: until the
 * chunk is in, the chest's icon (`ChestIcon`) stands in the art's box, under the same name, so nothing moves when the art comes.
 */
export function LazyChestArt(props: ChestArtProps) {
  const { rank, state = "rest", size = "md", label, className } = props;
  const name = label === undefined ? CHEST_NAME[rank] : label;
  const fallback = (
    <span
      {...(name ? { role: "img", "aria-label": name } : { "aria-hidden": true })}
      data-slot="chest-art-fallback"
      data-rank={rank}
      className={className}
      style={{ display: "inline-grid", placeItems: "center", fontSize: `${CHEST_ART_REM[size]}rem`, width: "1em", height: "1em", ...(state === "spent" && CHEST_SPENT) }}
    >
      {/* The icon's box is 1.25em wide: 0.6 of the art's box spans three quarters of it, as the art's chests do (70 to 82 %). */}
      <span style={{ fontSize: `${CHEST_ART_REM[size] * 0.6}rem` }}>
        <ChestIcon rank={rank} size="inherit" label={null} />
      </span>
    </span>
  );
  return (
    <Suspense fallback={fallback}>
      <ChestArt {...props} />
    </Suspense>
  );
}
