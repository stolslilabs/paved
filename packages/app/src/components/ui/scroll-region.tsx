import type { ComponentProps } from "react";
import { scrollHintRef } from "../../lib/scroll-hint";
import { cn } from "../../lib/utils";

/**
 * A plain scrolling box with the edge hint (NO-SCROLLBARS, issues 609 and 835): no scrollbar at any width (theme.css), a soft fade on the
 * side where more content waits (`scroll-hint`). Every scrollable region of the app is one of these or a `ScrollArea`.
 * `orientation` picks the overflow (`both` for a plan larger than the screen both ways); the hint follows whichever axis
 * actually scrolls.
 */
export function ScrollRegion({ className, orientation = "vertical", ...props }: ComponentProps<"div"> & { orientation?: "vertical" | "horizontal" | "both" }) {
  return (
    <div
      ref={scrollHintRef}
      data-slot="scroll-region"
      className={cn("scroll-hint", orientation === "both" ? "overflow-auto" : orientation === "vertical" ? "overflow-y-auto" : "overflow-x-auto", className)}
      {...props}
    />
  );
}
