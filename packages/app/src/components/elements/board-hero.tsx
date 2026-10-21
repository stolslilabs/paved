import { cn } from "../../lib/utils";
import heroTall from "../../assets/renders/hero-tall.webp";
import heroWide from "../../assets/renders/hero-wide.webp";

export interface BoardHeroProps {
  /** `fade`: the picture melts into the page at its bottom (Home); `veil`: a shade over all of it, for a card or text on top (Welcome). */
  shade?: "fade" | "veil";
  className?: string;
}

/**
 * Direction D's hero (issue 537): a render of a real board, the bench's recorded 72-tile game through the board's own renderer
 * (`scripts/direction-renders.ts`, copied by `scripts/app-renders.ts`): 750 x 1000 below `desktop`, 1440 x 720 from it, one of
 * the two fetched. Decorative; it fills its positioned parent and the shade keeps what stands on it readable. Self-hosted.
 */
export function BoardHero({ shade = "fade", className }: BoardHeroProps) {
  return (
    <div aria-hidden data-slot="board-hero" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <picture>
        <source media="(min-width: 64rem)" srcSet={heroWide} width={1440} height={720} />
        <img src={heroTall} alt="" width={750} height={1000} draggable={false} decoding="async" className="size-full object-cover" />
      </picture>
      <div className={cn("absolute inset-0 bg-linear-to-b", shade === "fade" ? "from-background/70 via-background/10 to-background" : "from-background/50 via-background/70 to-background")} />
    </div>
  );
}
