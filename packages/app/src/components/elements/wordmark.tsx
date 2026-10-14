import { cn } from "../../lib/utils";

export interface WordmarkProps {
  size?: "md" | "lg";
  /** The line under the name; none when omitted. */
  tagline?: string;
  className?: string;
}

/** The game's name in the display font token, gold on the board, as the mockups' title screens set it. */
export function Wordmark({ size = "lg", tagline, className }: WordmarkProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 text-center", className)}>
      <span
        className={cn(
          "font-display leading-none tracking-wider text-primary [text-shadow:0_3px_0_var(--color-gold-800),0_10px_30px_var(--color-gold-950)]",
          size === "lg" ? "text-5xl tablet:text-7xl" : "text-3xl",
        )}
      >
        PAVED
      </span>
      {tagline && <span className="text-xs tracking-[0.3em] text-muted-foreground uppercase">{tagline}</span>}
    </div>
  );
}
