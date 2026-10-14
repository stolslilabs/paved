import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

/** A placeholder block; the pulse stops under reduced motion. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)} {...props} />;
}
