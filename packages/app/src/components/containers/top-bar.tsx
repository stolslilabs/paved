import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { BalancesSlot, useBalancesStrip } from "./balances-context";
import { MockMark, useMockMarked } from "./mock-mark";

export interface TopBarProps {
  title?: ReactNode;
  /** Shows the Back button; none when omitted. */
  onBack?: () => void;
  /** The right side: a balance, a settings button. */
  end?: ReactNode;
  /**
   * The player's balances (#620), on by default, as the page's rule says (#720, `routes/header-balances.ts`): the Cobbles in a
   * strip under the title below `desktop`, the bar's right side from it.
   */
  balances?: boolean;
  /**
   * The page draws the player's Cobbles itself (the own village, in `end`): the bar leaves them out at every width, so they
   * never show twice (#720); below `desktop` it then has no strip.
   */
  ownCobbles?: boolean;
  className?: string;
}

/** The least width the title keeps before the bar stops centring it: under it, a title breaks a letter a line. */
const TITLE_MIN_PX = 96;

/**
 * The width of the bar's two side columns (`--side`): both as wide as the wider side, so the title sits at the bar's centre
 * (#622). When two such sides would leave the title less than `TITLE_MIN_PX` of `room` (the bar's width inside its padding and
 * gaps: a bar in a card, a wide `end` beside the balances), `auto`: each side takes its own width and the title the rest, off
 * centre rather than a letter a line.
 */
export function sideWidth(left: number, right: number, room: number): string {
  const side = Math.max(48, left, right);
  return 2 * side + TITLE_MIN_PX <= room ? `${side}px` : "auto";
}

const px = (value: string) => Number.parseFloat(value) || 0;

/**
 * The top bar of a full-screen flow (section 6.2): Back, the title centred, an action on the right; direction D (#537) closes it
 * with a hairline. The space under that line is the bar's own (`mb-4`, the pages' side padding, #622): the page below starts
 * flush, so every such page has the same gap. The balances (#620) show as on the tab pages, where the shell provides them: on a
 * phone in a strip under the title (the bar's sides stay narrow, so the title keeps its room), from `desktop` before `end`.
 * Its height is every page's header height (`page-header`, #676): the title row and the strip below `desktop`, one row from it.
 * A page without balances on a phone has no strip: its bar is the title row alone (`page-header-single`, #720). A title takes
 * two lines at most.
 * A bar too narrow to centre its title between two such sides keeps the title readable instead (`sideWidth`).
 */
export function TopBar({ title, onBack, end, balances = true, ownCobbles = false, className }: TopBarProps) {
  const marked = useMockMarked();
  const strip = useBalancesStrip() && balances && !ownCobbles;
  const bar = useRef<HTMLElement>(null);
  // The title centred in the bar (#622): both sides as wide as the wider one, whatever `end` holds, while the bar has the room.
  useLayoutEffect(() => {
    const el = bar.current!;
    const sides = [el.children[0]!.firstElementChild!, el.children[2]!.firstElementChild!] as HTMLElement[];
    const sync = () => {
      const style = getComputedStyle(el);
      const room = el.clientWidth - px(style.paddingLeft) - px(style.paddingRight) - 2 * px(style.columnGap);
      el.style.setProperty("--side", sideWidth(sides[0]!.offsetWidth, sides[1]!.offsetWidth, room));
    };
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    [el, ...sides].forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  return (
    <header
      ref={bar}
      data-slot="page-header"
      className={cn(
        "page-header grid grid-cols-[var(--side,3rem)_minmax(0,1fr)_var(--side,3rem)] items-center gap-x-1 mb-4 border-b border-border px-2",
        !strip && "page-header-single",
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
          {balances && <BalancesSlot layout="rail" noCobbles={ownCobbles} className="hidden desktop:flex" />}
          {end}
        </span>
      </span>
      {strip && (
        <span className="col-span-3 flex justify-end empty:hidden desktop:hidden">
          <BalancesSlot layout="pill" />
        </span>
      )}
    </header>
  );
}
