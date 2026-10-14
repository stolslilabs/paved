import type { ComponentProps } from "react";
import { Toaster as Sonner, toast } from "sonner";

/**
 * The toast host (the mockups' "Tile placed! + 8 points"). Dark only, so the theme is fixed. Sonner animates its own
 * toasts; under reduced motion the transitions are cut in `theme.css`. Colours come from the semantic tokens.
 */
export function Toaster(props: ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
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
