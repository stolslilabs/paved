import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

// A card is a surface, not a control: `card` over `background` is 1.14:1 and its `border` edge 1.21:1 on the card.
// Both fall under 3:1; WCAG 1.4.11 asks nothing more of a non-interactive grouping, so the Card keeps `border`.
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card" className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card py-5 text-card-foreground shadow-sm", className)} {...props} />;
}
export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("grid gap-1.5 px-5", className)} {...props} />;
}
export function CardTitle({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("leading-none font-semibold", className)} {...props} />;
}
export function CardDescription({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-5", className)} {...props} />;
}
export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center px-5", className)} {...props} />;
}
