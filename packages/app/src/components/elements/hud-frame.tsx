import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";
import { CARD_FRAME_SLICE, uiFrameImageSet } from "./ui-art";

/** The frame's style at a corner of `px` CSS px (its 9-slice): the rim about 0.42 of it, the corner's curve about 0.8. */
export function hudFrameStyle(px: number): CSSProperties {
  return {
    borderStyle: "solid",
    borderColor: "transparent",
    borderWidth: px,
    borderImageSource: uiFrameImageSet("card-frame"),
    borderImageSlice: `${(CARD_FRAME_SLICE.y * 100).toFixed(2)}% ${(CARD_FRAME_SLICE.x * 100).toFixed(2)}%`,
    borderImageWidth: `${px}px`,
    borderImageRepeat: "stretch",
  };
}

export interface HudFrameProps {
  /** The frame's corner in CSS px: 13 on the player card, 10 on a capsule (the rim keeps about the same thickness). */
  px: number;
  className?: string;
}

/**
 * The HUD's frame (HOME-UI-CARD and HOME-UI-CAPSULES, `docs/design/home.webp` decomposed layer by layer): under a control's content,
 * a see-through dark grey face, then the mockup's painted frame (`card-frame`: a near-black outline and a slate rim with its
 * irregularity, a 9-slice) with a crisp black drop shadow that follows its edge. The player card and the capsules (the crowns, the
 * village, the shield, the balances) share it, their rim about the same thickness whatever their height. Its parent is `relative
 * isolate` (the two layers sit under the content at `-z-10`). Decorative.
 */
export function HudFrame({ px, className }: HudFrameProps) {
  return (
    <>
      <span
        aria-hidden
        data-slot="hud-face"
        className="pointer-events-none absolute inset-[3px] -z-10 bg-hud-card/80 shadow-[inset_0_1px_2px_var(--background)] backdrop-blur-sm"
        style={{ borderRadius: Math.round(px * 0.8) }}
      />
      <span
        aria-hidden
        data-slot="hud-frame"
        className={cn("pointer-events-none absolute inset-0 -z-10 [filter:drop-shadow(0_1.5px_0_var(--background))_drop-shadow(0_3px_5px_var(--background))]", className)}
        style={hudFrameStyle(px)}
      />
    </>
  );
}
