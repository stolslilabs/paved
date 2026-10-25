import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { documentScrollStartHint } from "../../lib/document-scroll-hint";
import { BalancesSlot, PageBalances } from "./balances-context";
import { MockMark, useMockMarked } from "./mock-mark";

export interface TopBarProps {
  title?: ReactNode;
  /** Shows the Back button; none when omitted. */
  onBack?: () => void;
  /** The right side: a balance, a settings button. */
  end?: ReactNode;
  /**
   * The player's balances (#620), on by default, as the page's rule says (#720, `routes/header-balances.ts`): the Cobbles in the
   * page under the bar, at its top right, below `desktop` (#760); the bar's right side from it.
   */
  balances?: boolean;
  /**
   * The page draws the player's Cobbles itself (the own village, in `end`): the bar leaves them out at every width, so they
   * never show twice (#720); below `desktop` none then sit under the bar.
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
 * flush, so every such page has the same gap. PAGE-HEADER (#760): one row at every width, every page's header height
 * (`page-header`, #676), and sticky at the top of the flow's column (its document scrolls), with the navigation's backdrop, so
 * Back stays in reach at the page's bottom; a fade under it shows the page has more above (`page-less`). The balances (#620)
 * show as on the tab pages, where the shell provides them: from `desktop` before `end`; below it in the page, under the bar at
 * its top right (`PageBalances`), so the bar never takes a second row. A title takes one line, cut with an ellipsis (its whole text in `title`).
 * A bar too narrow to centre its title between two such sides keeps the title readable instead (`sideWidth`).
 */
export function TopBar({ title, onBack, end, balances = true, ownCobbles = false, className }: TopBarProps) {
  const marked = useMockMarked();
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
  useEffect(documentScrollStartHint, []);
  return (
    <>
    <header
      ref={bar}
      data-slot="page-header"
      className={cn(
        "page-header sticky top-0 z-30 grid grid-cols-[var(--side,3rem)_minmax(0,1fr)_var(--side,3rem)] items-center gap-x-1 mb-4 border-b border-border bg-background/95 px-2 backdrop-blur",
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
      <span title={typeof title === "string" ? title : undefined} className={cn("line-clamp-1 text-center", marked && "px-12")}>
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
      <span aria-hidden data-slot="page-top-hint" className="pointer-events-none absolute inset-x-0 top-full h-6 bg-linear-to-t to-background opacity-0 transition-opacity motion-reduce:transition-none page-less:opacity-100" />
    </header>
    {balances && <PageBalances noCobbles={ownCobbles} className="mx-auto mb-2 w-full max-w-md px-4 tablet:max-w-2xl" />}
    </>
  );
}
