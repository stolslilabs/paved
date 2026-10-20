import type { ComponentProps } from "react";
import { scrollHintRef } from "../../lib/scroll-hint";
import { cn } from "../../lib/utils";

/**
 * A plain scrolling box with the edge hint (NO-SCROLLBARS, issue 609): no scrollbar on desktop (theme.css), a soft fade on the
 * side where more content waits (`scroll-hint`). Every scrollable region of the app is one of these or a `ScrollArea`.
 * `orientation` picks the overflow; the hint follows whichever axis actually scrolls.
 */
export function ScrollRegion({ className, orientation = "vertical", ...props }: ComponentProps<"div"> & { orientation?: "vertical" | "horizontal" }) {
  return (
    <div
      ref={scrollHintRef}
      data-slot="scroll-region"
      className={cn("scroll-hint", orientation === "vertical" ? "overflow-y-auto" : "overflow-x-auto", className)}
      {...props}
    />
  );
}
