import { cn } from "../../lib/utils";
import banner from "../../assets/banner.svg";

export interface WordmarkProps {
  size?: "md" | "lg";
  /** The line under the name; none when omitted. */
  tagline?: string;
  className?: string;
}

/**
 * The game's name: the official wordmark (`assets/banner.svg`, the file the book uses, whitespace-trimmed), self-hosted as an
 * image with the accessible name "Paved". Its box is 1940 x 500, so the width sets the height.
 */
export function Wordmark({ size = "lg", tagline, className }: WordmarkProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 text-center", className)}>
      <img
        src={banner}
        alt="Paved"
        width={1940}
        height={500}
        className={cn("h-auto max-w-full", size === "lg" ? "w-72 tablet:w-96" : "w-44")}
      />
      {tagline && <span className="text-xs tracking-[0.3em] text-muted-foreground uppercase">{tagline}</span>}
    </div>
  );
}
