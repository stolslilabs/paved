import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { BalancesSlot } from "./balances-context";
import { MockMark, useMockMarked } from "./mock-mark";

export interface TopBarProps {
  title?: ReactNode;
  /** Shows the Back button; none when omitted. */
  onBack?: () => void;
  /** The right side: a balance, a settings button. */
  end?: ReactNode;
  /** The player's balances (#620), on by default: a strip under the title below `desktop`, the bar's right side from it. */
  balances?: boolean;
  className?: string;
}

/**
 * The top bar of a full-screen flow (section 6.2): Back, the title centred, an action on the right; direction D (#537) closes it
 * with a hairline. The space under that line is the bar's own (`mb-4`, the pages' side padding, #622): the page below starts
 * flush, so every such page has the same gap. The balances (#620) show as on the tab pages, where the shell provides them: on a
 * phone in a strip under the title (the bar's sides stay narrow, so the title keeps its room), from `desktop` before `end`.
 * Its height is every page's header height (`page-header`, #676): the title row and the strip below `desktop` (the strip's
 * room kept without balances), one row from it. A title takes two lines at most.
 */
export function TopBar({ title, onBack, end, balances = true, className }: TopBarProps) {
  const marked = useMockMarked();
  const bar = useRef<HTMLElement>(null);
  // The title centred in the bar (#622): both sides as wide as the wider one, whatever `end` holds.
  useLayoutEffect(() => {
    const el = bar.current!;
    const sides = [el.children[0]!.firstElementChild!, el.children[2]!.firstElementChild!] as HTMLElement[];
    const sync = () => el.style.setProperty("--side", `${Math.max(48, sides[0]!.offsetWidth, sides[1]!.offsetWidth)}px`);
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    sides.forEach((side) => observer.observe(side));
    return () => observer.disconnect();
  }, []);
  return (
    <header
      ref={bar}
      data-slot="page-header"
      className={cn(
        "page-header grid grid-cols-[var(--side,3rem)_minmax(0,1fr)_var(--side,3rem)] items-center gap-x-1 mb-4 border-b border-border px-2",
        className,
      )}
    >
      <span className="flex">
        <span className="flex w-max shrink-0">
          {onBack && (
            <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
              <Icon name="chevron-left" />
            </Button>
          )}
        </span>
      </span>
      {/*
        The mark on the title's line, after its last word when the title wraps (#622). It takes no width in the line (its
        negative margin); the title's box keeps its room on both sides instead, so the title stays at the centre.
      */}
      <span title={typeof title === "string" ? title : undefined} className={cn("line-clamp-2 text-center", marked && "px-12")}>
        <h1 className="inline text-lg leading-tight font-semibold wrap-anywhere">{title}</h1>
        {marked && (
          <span className="-mr-12 ml-1 inline-flex w-11 align-[0.125rem]">
            <MockMark className="w-full px-0" />
          </span>
        )}
      </span>
      <span className="flex justify-end">
        <span className="flex w-max shrink-0 items-center justify-end gap-2">
          {balances && <BalancesSlot layout="rail" className="hidden desktop:flex" />}
          {end}
        </span>
      </span>
      {balances && (
        <span className="col-span-3 flex justify-end empty:hidden desktop:hidden">
          <BalancesSlot layout="pill" />
        </span>
      )}
    </header>
  );
}
