import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * The rule after a section's title (the owner's ask of 2026-11-04, PROFILE-PAGE): engraved as the carved surfaces are, a light line
 * over a dark one, fading out to the right. Inline: the one stylesheet has no room to spare.
 */
const TITLE_RULE: CSSProperties = {
  height: 2,
  background: "linear-gradient(var(--drawer-bevel) 50%, var(--hud-outline) 50%)",
  maskImage: "linear-gradient(to right, black, transparent)",
};
/** The rule's head: a small diamond in the line's light. */
const TITLE_DIAMOND: CSSProperties = { background: "var(--drawer-bevel)", boxShadow: "0 1px 0 var(--hud-outline)", transform: "rotate(45deg)" };

export interface SectionTitleProps {
  children: ReactNode;
  /** What the row holds at its end (the profile's Stats badge, a mission row's countdown). */
  end?: ReactNode;
  /** The heading's id, for a section's `aria-labelledby`. */
  id?: string;
  className?: string;
}

/**
 * A section's title in the HUD's drawer (the profile, the missions): in the display font (the owner's ask of 2026-11-04: titles in
 * it), the engraved rule after it across the row, and what the row holds at its end, a gap either side of the rule so nothing
 * touches it.
 */
export function SectionTitle({ children, end, id, className }: SectionTitleProps) {
  return (
    <div className={cn("flex min-h-9 items-center gap-3", className)}>
      <h3 id={id} className="text-outline flex shrink-0 items-baseline gap-2 font-display text-2xl leading-tight tracking-wide">
        {children}
      </h3>
      <span aria-hidden className="flex min-w-6 flex-1 items-center gap-1">
        <span className="size-1.5 shrink-0" style={TITLE_DIAMOND} />
        <span className="flex-1" style={TITLE_RULE} />
      </span>
      {end}
    </div>
  );
}
