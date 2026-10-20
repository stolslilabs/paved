import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { MockMark, useMockMarked } from "./mock-mark";

export interface TopBarProps {
  title?: ReactNode;
  /** Shows the Back button; none when omitted. */
  onBack?: () => void;
  /** The right side: a balance, a settings button. */
  end?: ReactNode;
  className?: string;
}

/** The gap between the title and the mark, in px (`ml-1`). */
const MARK_GAP = 4;

/**
 * The top bar of a full-screen flow (section 6.2): Back, the title centred, an action on the right; direction D (#537) closes it
 * with a hairline. The space under that line is the bar's own (`mb-4`, the pages' side padding, #622): the page below starts
 * flush, so every such page has the same gap.
 */
export function TopBar({ title, onBack, end, className }: TopBarProps) {
  const marked = useMockMarked();
  const bar = useRef<HTMLElement>(null);
  const start = useRef<HTMLSpanElement>(null);
  const finish = useRef<HTMLSpanElement>(null);
  const mark = useRef<HTMLSpanElement>(null);
  // The title centred in the bar (#622): both sides as wide as the wider one, whatever `end` holds; and the mark's room kept
  // on both sides of the title, the mark itself taking none in the line, so it never pushes the title off the centre.
  useLayoutEffect(() => {
    const sides = [start.current, finish.current];
    const sync = () => {
      bar.current?.style.setProperty("--top-bar-side", `${Math.max(48, ...sides.map((s) => s?.offsetWidth ?? 0))}px`);
      bar.current?.style.setProperty("--top-bar-mark", mark.current ? `${mark.current.offsetWidth + MARK_GAP}px` : "0px");
    };
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    for (const el of [...sides, mark.current]) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [marked]);
  return (
    // At least 56 px, never fixed: a long title wraps (WRAP360) and the bar grows with it.
    <header
      ref={bar}
      className={cn(
        "grid min-h-14 shrink-0 grid-cols-[var(--top-bar-side,3rem)_minmax(0,1fr)_var(--top-bar-side,3rem)] items-center gap-1 mb-4 border-b border-border px-2 pt-[env(safe-area-inset-top)] pb-1",
        className,
      )}
    >
      <span className="flex">
        <span ref={start} className="flex w-max shrink-0">
          {onBack && (
            <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
              <Icon name="chevron-left" />
            </Button>
          )}
        </span>
      </span>
      {/* The mark on the title's line, after its last word when the title wraps (#622). */}
      <span className="px-[var(--top-bar-mark,0px)] text-center">
        <h1 className="inline text-lg leading-tight font-semibold wrap-anywhere">{title}</h1>
        {marked && (
          <span ref={mark} className="ml-1 mr-[calc(-1*var(--top-bar-mark,0px))] inline-block align-[0.125rem]">
            <MockMark className="px-1.5" />
          </span>
        )}
      </span>
      <span className="flex justify-end">
        <span ref={finish} className="flex w-max shrink-0 justify-end">
          {end}
        </span>
      </span>
    </header>
  );
}
