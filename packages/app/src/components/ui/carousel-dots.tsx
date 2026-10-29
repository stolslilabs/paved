import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

export interface CarouselDotsProps extends Omit<ComponentProps<"div">, "onSelect"> {
  /** How many slides. */
  count: number;
  /** The slide in view: its dot is widened, in the primary colour. */
  current: number;
  /** A tap on a dot: the slide to go to. Left out, the dots only show the position (hidden from screen readers). */
  onSelect?: (index: number) => void;
  /** A dot's accessible name, when they are buttons: "Go to Gold II". */
  label?: (index: number) => string;
  /** At most this many dots, a window around the current one (issue 833, open point 2); all of them by default. */
  window?: number;
}

/** The first dot of a window of `size` around `current`, held inside the row. */
export function dotsWindow(count: number, current: number, size: number): number {
  if (size >= count) return 0;
  return Math.max(0, Math.min(count - size, current - Math.floor(size / 2)));
}

/**
 * The dots under a carousel (issue 833, from the Story page's campaigns): one per slide, 6 px with 4 px between, the current one
 * widened. With `onSelect` each dot is a button that jumps to its slide, its hit area taller than the dot; the row stays one
 * line (23 dots fit 320 px).
 */
export function CarouselDots({ count, current, onSelect, label, window: size = count, className, ...props }: CarouselDotsProps) {
  const from = dotsWindow(count, current, size);
  const indexes = Array.from({ length: Math.min(size, count) }, (_, i) => from + i);
  const dot = (index: number) => cn("block h-1.5 rounded-full transition-all", index === current ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/40");
  if (!onSelect)
    return (
      <div aria-hidden data-slot="carousel-dots" className={cn("flex justify-center gap-1", className)} {...props}>
        {indexes.map((i) => (
          <span key={i} className={dot(i)} />
        ))}
      </div>
    );
  return (
    <div role="group" data-slot="carousel-dots" className={cn("flex justify-center", className)} {...props}>
      {indexes.map((i) => (
        <button
          key={i}
          type="button"
          aria-label={label?.(i) ?? `Go to ${i + 1}`}
          aria-current={i === current ? "true" : undefined}
          onClick={() => onSelect(i)}
          className="grid h-6 touch-manipulation place-items-center rounded-full px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={dot(i)} />
        </button>
      ))}
    </div>
  );
}
