import { cn } from "../../lib/utils";
import voxel from "../../assets/renders/wordmark.webp";

export interface WordmarkProps {
  /** `sm`: the navigation's header; `md`: a page's; `lg`: a hero's. */
  size?: "sm" | "md" | "lg";
  /** The line under the name; none when omitted. */
  tagline?: string;
  className?: string;
}

const WIDTH = { sm: "w-28", md: "w-44", lg: "w-72 tablet:w-96" } as const;

/**
 * The game's name: the voxel wordmark of direction D (issue 537), the letters of `assets/banner.svg` read on their own block grid and
 * built as stone blocks with grass on their tops, drawn by the board's renderer (`scripts/direction-renders.ts`, copied for the
 * app by `scripts/app-renders.ts`). Self-hosted, with the accessible name "Paved". Its box is 840 x 240, so the width sets the height.
 */
export function Wordmark({ size = "lg", tagline, className }: WordmarkProps) {
  return (
    <div className={cn("flex flex-col items-center gap-1 text-center", className)}>
      <img src={voxel} alt="Paved" draggable={false} width={840} height={240} decoding="async" className={cn("h-auto max-w-full", WIDTH[size])} />
      {tagline && <span className="text-xs font-semibold tracking-[0.3em] text-muted-foreground uppercase">{tagline}</span>}
    </div>
  );
}
