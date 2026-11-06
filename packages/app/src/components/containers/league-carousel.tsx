import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { useReducedMotionConfig } from "motion/react";
import { cn } from "../../lib/utils";
import { LEAGUES, type League } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "../ui/carousel";

/**
 * The carousel's slides: Unranked first (a player who has not entered the leagues, a client state, `null` as `tierOf` reads it,
 * #917), before Wood; then the 23 leagues.
 */
export const LEAGUE_SLIDES: readonly (League | null)[] = [null, ...LEAGUES];
/** A league's slide in `LEAGUE_SLIDES`; Unranked's (`null`) is the first. */
export const slideOf = (league: League | null): number => (league ? league.index + 1 : 0);
const slideName = (league: League | null) => league?.name ?? "Unranked";

export interface LeagueCarouselProps {
  /** The slide in view (`slideOf`): 0 Unranked, 1 Wood to 23 Grand Master. */
  selected: number;
  onSelect: (index: number) => void;
  /** The player's slide (`aria-current`). */
  mine: number;
  /** A league's card (`LeagueCard`), Unranked's as `null`, the same height for every one (#833). */
  children: (league: League | null, current: boolean) => ReactNode;
  /** The carousel's whole block (the arrows, the card): the League control brings it into view (#859). */
  ref?: Ref<HTMLDivElement>;
  className?: string;
}

/** An arrow's button: a 44 px target at the carousel's edge, muted until hovered. */
export const ARROW = "size-11 shrink-0 rounded-full text-muted-foreground hover:text-foreground";

/**
 * An arrow's glyph (the owner's ask of 2026-11-05: subtle arrows rather than the book's chunky chevrons): a thin arrow, its shaft and
 * its head with rounded ends, in the muted text colour, the foreground's under the pointer.
 */
export function Arrow({ to }: { to: "left" | "right" }) {
  const d = to === "left" ? "M19 12H5m6-6-6 6 6 6" : "M5 12h14m-6-6 6 6-6 6";
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Brought into view in the drawer's body (LEAGUE-PAGE), under its header band, with the body's own top padding. */
const SCROLL_MARGIN = { scrollMarginTop: "1rem" };

/**
 * The leagues one per view (#785), Unranked then Wood to Grand Master, each card standing alone (#859): the arrows on each side of
 * it (thin arrows), a swipe and the arrow keys move through them, and stop at both ends. No dots (the owner's ask of
 * 2026-11-05: 24 were too many). The index is the scene's: Embla follows it (a cut under reduced motion) and reports a swipe's
 * landing. Only the league in view is in the accessibility tree.
 */
export function LeagueCarousel({ ref, selected, onSelect, mine, children, className }: LeagueCarouselProps) {
  const [api, setApi] = useState<CarouselApi>();
  const reduced = useReducedMotionConfig();
  const last = LEAGUE_SLIDES.length - 1;
  const step = useCallback((by: number) => onSelect(Math.max(0, Math.min(last, selected + by))), [onSelect, selected, last]);

  // A swipe lands on a snap: the scene takes it.
  useEffect(() => {
    if (!api) return;
    const land = (api: CarouselApi) => api && onSelect(api.selectedScrollSnap());
    api.on("select", land);
    return () => {
      api.off("select", land);
    };
  }, [api, onSelect]);

  // An arrow, a key or the header's League control (#859): Embla glides there, or cuts under reduced motion.
  useEffect(() => {
    if (api && api.selectedScrollSnap() !== selected) api.scrollTo(selected, Boolean(reduced));
  }, [api, selected, reduced]);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    // Before the carousel's own handler: the index stays the scene's, so the ends hold where Embla measures nothing.
    event.preventDefault();
    event.stopPropagation();
    step(event.key === "ArrowLeft" ? -1 : 1);
  };

  return (
    // Inline, not a class: an arbitrary value costs the stylesheet's budget.
    <div ref={ref} style={SCROLL_MARGIN} className={cn("flex w-full min-w-0 flex-col items-center gap-2", className)}>
      <div className="flex w-full items-center gap-1">
        <Button variant="ghost" size="icon" className={ARROW} aria-label="Previous league" disabled={selected === 0} onClick={() => step(-1)}>
          <Arrow to="left" />
        </Button>
        <Carousel
          aria-label="Leagues"
          tabIndex={0}
          setApi={setApi}
          opts={{ startIndex: selected }}
          onKeyDownCapture={onKey}
          className="min-w-0 flex-1 rounded-lg outline-none"
        >
          <CarouselContent>
            {LEAGUE_SLIDES.map((l, i) => (
              <CarouselItem
                key={i}
                aria-label={slideName(l)}
                aria-current={i === mine ? "true" : undefined}
                aria-hidden={i === selected ? undefined : true}
                inert={i !== selected}
                data-league={l?.index}
              >
                {children(l, i === selected)}
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
        <Button variant="ghost" size="icon" className={ARROW} aria-label="Next league" disabled={selected === last} onClick={() => step(1)}>
          <Arrow to="right" />
        </Button>
      </div>
      <p aria-live="polite" className="sr-only">
        {slideName(LEAGUE_SLIDES[selected]!)}
      </p>
    </div>
  );
}
