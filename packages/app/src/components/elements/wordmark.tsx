import { cn } from "../../lib/utils";
import voxel from "../../assets/renders/wordmark.webp";

export interface WordmarkProps {
  /** The line under the name. */
  tagline: string;
  className?: string;
}

/**
 * The game's name: the voxel wordmark of direction D (issue 537), the letters of `assets/banner.svg` read on their own block grid and
 * built as stone blocks with grass on their tops, drawn by the board's renderer (`scripts/direction-renders.ts`, copied for the
 * app by `scripts/app-renders.ts`). Self-hosted, with the accessible name "Paved". Its box is 840 x 240, so the width sets the height:
 * a hero's (the loading screen), the one place it shows.
 */
export function Wordmark({ tagline, className }: WordmarkProps) {
  return (
    <div className={cn("flex flex-col items-center gap-1 text-center", className)}>
      <img src={voxel} alt="Paved" draggable={false} width={840} height={240} decoding="async" className="h-auto w-72 max-w-full tablet:w-96" />
      <span className="text-xs font-semibold tracking-[0.3em] text-muted-foreground uppercase">{tagline}</span>
    </div>
  );
}
