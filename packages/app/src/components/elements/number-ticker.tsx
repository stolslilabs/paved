/*
 * Source: Magic UI's Number Ticker (apps/www/registry/magicui/number-ticker.tsx,
 * https://github.com/magicuidesign/magicui at commit 85f97fd27b053339af74ba9dd4ca428ee25989fb, MIT, (c) Magic UI).
 * Adapted: reduced motion (from `MotionConfig`) writes the value at once, the formatter is built once per
 * `decimalPlaces`, the colour is inherited (no raw black and white), the `direction` prop is dropped (Paved's counters
 * only go towards their value).
 */
import { formatFixed } from "@paved/game-core";
import { useEffect, useMemo, useRef, type ComponentProps } from "react";
import { useInView, useMotionValue, useReducedMotionConfig, useSpring } from "motion/react";
import { cn } from "../../lib/utils";

export type NumberTickerProps = Omit<ComponentProps<"span">, "children"> & {
  /** The value the counter settles on (a score, a PAVED amount). A later change springs from the shown value. */
  value: number;
  /** Shown before the counter first enters the viewport. */
  startValue?: number;
  /** Seconds to wait, once in view, before counting. */
  delay?: number;
  decimalPlaces?: number;
};

/**
 * A number that springs to its value when it first scrolls into view, and again on each change (section 3.2). The
 * text is written straight to the span (no React render per frame). Hooks only: no `m` component, so it needs no
 * Motion feature set.
 */
export function NumberTicker({ value, startValue = 0, delay = 0, decimalPlaces = 0, className, ...props }: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotionConfig();
  const motionValue = useMotionValue(startValue);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const isInView = useInView(ref, { once: true, margin: "0px" });
  const format = useMemo(() => (n: number) => formatFixed(n, decimalPlaces), [decimalPlaces]);

  useEffect(() => {
    if (!isInView) return;
    if (reduced) {
      // No count: the final value, at once.
      springValue.jump(value);
      if (ref.current) ref.current.textContent = format(Number(value.toFixed(decimalPlaces)));
      return;
    }
    const timer = setTimeout(() => motionValue.set(value), delay * 1000);
    return () => clearTimeout(timer);
  }, [motionValue, springValue, isInView, delay, value, reduced, format, decimalPlaces]);

  useEffect(
    () =>
      springValue.on("change", (latest) => {
        if (ref.current) ref.current.textContent = format(Number(latest.toFixed(decimalPlaces)));
      }),
    [springValue, format, decimalPlaces],
  );

  return (
    <span ref={ref} data-slot="number-ticker" className={cn("inline-block tracking-wider tabular-nums", className)} {...props}>
      {format(startValue)}
    </span>
  );
}
