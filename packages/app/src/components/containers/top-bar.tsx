import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

export interface TopBarProps {
  title?: ReactNode;
  /** Shows the Back button; none when omitted. */
  onBack?: () => void;
  /** The right side: a balance, a settings button. */
  end?: ReactNode;
  className?: string;
}

/** The top bar of a full-screen flow (section 6.2): Back, the title centred, an action on the right. */
export function TopBar({ title, onBack, end, className }: TopBarProps) {
  return (
    // At least 56 px, never fixed: a long title wraps (WRAP360) and the bar grows with it.
    <header className={cn("grid min-h-14 shrink-0 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 px-2 pt-[env(safe-area-inset-top)]", className)}>
      <span>
        {onBack && (
          <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
            <Icon name="chevron-left" />
          </Button>
        )}
      </span>
      <h1 className="text-center font-display text-lg leading-tight font-semibold wrap-anywhere">{title}</h1>
      <span className="flex min-w-12 justify-end">{end}</span>
    </header>
  );
}
