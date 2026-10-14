/*
 * Source: shadcn/ui's Sonner wrapper on Sonner (`sonner` 2.0.8, https://sonner.emilkowal.ski, MIT, (c) 2023 Emil
 * Kowalski), kept from F3 as F3b's toast (docs/client/v2-architecture.md, "Animated components: chosen sources").
 */
import type { ComponentProps } from "react";
import { useReducedMotionConfig } from "motion/react";
import { Toaster as Sonner, toast } from "sonner";
import { cn } from "../../lib/utils";

/**
 * The toast host (the mockups' "Tile placed! + 8 points"). Dark only, so the theme is fixed. Sonner animates its own
 * toasts on CSS transitions; under reduced motion (the app's `MotionConfig`) `theme.css` cuts them. Colours come from
 * the semantic tokens.
 */
export function Toaster({ className, ...props }: ComponentProps<typeof Sonner>) {
  const reduced = useReducedMotionConfig();
  return (
    <Sonner
      theme="dark"
      className={cn("toaster group", reduced && "toaster-reduced-motion", className)}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--popover)",
          "--success-text": "var(--success)",
          "--success-border": "var(--border)",
          "--error-bg": "var(--popover)",
          "--error-text": "var(--destructive-foreground)",
          "--error-border": "var(--destructive)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { toast };
