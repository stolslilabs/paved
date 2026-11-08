import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { HudFrame } from "../elements/hud-frame";
import { UiIcon } from "../elements/ui-icon";

/** A notice's answer (the stale board's Retry): the drawers' raised pill, 44 px tall. */
export const NOTICE_ACTION = "drawer-raised state-layer text-outline flex min-h-11 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-sm font-bold outline-none disabled:pointer-events-none disabled:opacity-50";

export interface BoardNoticeProps {
  /** `warning`: the painted amber sign (storage off, a board out of date, the dev's prediction off); the painted blue "i" otherwise. */
  tone?: "info" | "warning";
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * A line under the board's header (GAME-OVERLAY): a state the player must read over the board (another player's game, storage off, the
 * board out of date, the dev's prediction off), on the HUD's frame as the header over it and Story's tip: the painted sign, the title
 * outlined, a short line. Never an error: every error is `InlineError`'s (P-67). A `status` region, as `Notice`.
 */
export function BoardNotice({ tone = "info", title, children, action, className }: BoardNoticeProps) {
  return (
    <div role="status" data-tone={tone} className={cn("relative isolate flex items-center gap-2.5 py-2 pr-2 pl-2.5", className)}>
      <HudFrame px={13} />
      {tone === "warning" ? (
        <UiIcon name="caution" px={32} className="drawer-icon size-8 shrink-0" />
      ) : (
        <UiIcon name="info" px={32} className="drawer-icon size-8 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col wrap-anywhere">
        <span className="text-outline text-sm leading-snug font-bold">{title}</span>
        <span className="text-sm leading-snug font-semibold text-muted-foreground">{children}</span>
      </div>
      {action}
    </div>
  );
}
