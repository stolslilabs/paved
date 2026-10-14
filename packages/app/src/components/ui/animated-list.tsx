/*
 * Source: Magic UI's Animated List (apps/www/registry/magicui/animated-list.tsx, its `AnimatedListItem`,
 * https://github.com/magicuidesign/magicui at commit 85f97fd27b053339af74ba9dd4ca428ee25989fb, MIT, (c) Magic UI).
 * Adapted: `m` for LazyMotion, a real list (`ul` / `li`), and the list shows the rows it is given: the original's
 * timer that reveals one child per second (a demo of notifications) is dropped.
 */
import type { ComponentProps } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";

export type AnimatedListProps = ComponentProps<"ul"> & {
  /** Animate the rows present at the first render too (default), or only the rows that arrive later. */
  initial?: boolean;
};

/**
 * Rows enter and leave (leaderboard rows, the closings list): each `AnimatedListItem` needs a stable `key`. A new row
 * grows in, a removed one shrinks out, and the others slide to their new place (`layout`, section 3.2). Under reduced
 * motion `MotionConfig` keeps the fade and drops the scale and the slide.
 */
export function AnimatedList({ className, children, initial = true, ...props }: AnimatedListProps) {
  return (
    <ul data-slot="animated-list" className={cn("flex flex-col gap-2", className)} {...props}>
      <AnimatePresence initial={initial}>{children}</AnimatePresence>
    </ul>
  );
}

export type AnimatedListItemProps = Omit<ComponentProps<"li">, "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart">;

export function AnimatedListItem({ className, ...props }: AnimatedListItemProps) {
  return (
    <m.li
      data-slot="animated-list-item"
      layout
      className={cn("w-full", className)}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, originY: 0 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 40 }}
      {...props}
    />
  );
}
