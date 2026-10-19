import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { MockMarkSlot } from "./mock-mark";

export interface TopBarProps {
  title?: ReactNode;
  /** Shows the Back button; none when omitted. */
  onBack?: () => void;
  /** The right side: a balance, a settings button. */
  end?: ReactNode;
  className?: string;
}

/** The top bar of a full-screen flow (section 6.2): Back, the title centred, an action on the right; direction D (#537) closes it with a hairline. */
export function TopBar({ title, onBack, end, className }: TopBarProps) {
  return (
    // At least 56 px, never fixed: a long title wraps (WRAP360) and the bar grows with it.
    <header className={cn("grid min-h-14 shrink-0 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-2 pt-[env(safe-area-inset-top)] pb-1", className)}>
      <span>
        {onBack && (
          <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
            <Icon name="chevron-left" />
          </Button>
        )}
      </span>
      <span className="flex flex-col items-center gap-0.5">
        <h1 className="text-center text-lg leading-tight font-semibold wrap-anywhere">{title}</h1>
        <MockMarkSlot />
      </span>
      <span className="flex min-w-12 justify-end">{end}</span>
    </header>
  );
}
