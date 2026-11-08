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
  /**
   * The title: a fixed word, a painted icon before it at most. Never a figure that changes (the owner's rule of 2026-11-07,
   * TILE-COUNTS): no count, no X/Y, no total, no timer, no amount. Such a figure goes into the section's content (a carved box, a
   * chip on its first line, a row's pill) or is dropped. `__tests__/section-title-rule.test.ts` fails on a figure written in it.
   */
  children: ReactNode;
  /**
   * A control at the row's end, never a figure (the same rule): a toggle, a filter's chip and its cross (the profile's Stats span),
   * a button. A count, a timer or a progress ("3/8", "9h 0m", "21/28") goes into the section's content, not here.
   */
  end?: ReactNode;
  /** The heading's id, for a section's `aria-labelledby`. */
  id?: string;
  className?: string;
}

/**
 * A section's title in the HUD's drawer (the profile, the missions): in the display font (the owner's ask of 2026-11-04: titles in
 * it), the engraved rule after it across the row, and a control at its end if any, a gap either side of the rule so nothing
 * touches it. The title is a fixed word: no changing figure in it nor at its end (TILE-COUNTS, the owner's rule of 2026-11-07).
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
