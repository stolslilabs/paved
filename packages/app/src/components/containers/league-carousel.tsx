import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { useReducedMotionConfig } from "motion/react";
import { cn } from "../../lib/utils";
import { LEAGUES, type League } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "../ui/carousel";
import { CarouselDots } from "../ui/carousel-dots";
import { Icon } from "../ui/icon";

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
  /** The carousel's whole block (the arrows, the card, the dots): the League control brings it into view (#859). */
  ref?: Ref<HTMLDivElement>;
  className?: string;
}

const SCROLL_MARGIN = { scrollMarginTop: "calc(var(--header-h) + env(safe-area-inset-top) + 1rem)" };

/**
 * The leagues one per view (#785), Unranked then Wood to Grand Master, each card standing alone (#859): the arrows on each side of it, a swipe, the arrow keys and the dots under it (#833, one
 * per league, the current one widened, a tap jumps there) move through them, and stop at both ends. The index is the scene's: Embla follows it (a cut under reduced motion) and reports a swipe's landing. Only the
 * league in view is in the accessibility tree.
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

  // An arrow, a key, a dot or the header's League control (#859): Embla glides there, or cuts under reduced motion.
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
    // Brought into view under the sticky header (`--header-h`, the notch's inset), with the bar's own gap (`TopBar`'s `mb-4`). Inline,
    // not a class: an arbitrary value costs the stylesheet's budget.
    <div ref={ref} style={SCROLL_MARGIN} className={cn("flex w-full min-w-0 flex-col items-center gap-2", className)}>
      <div className="flex w-full items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Previous league" disabled={selected === 0} onClick={() => step(-1)}>
          <Icon name="chevron-left" size="md" />
        </Button>
        <Carousel
          aria-label="Leagues"
          tabIndex={0}
          setApi={setApi}
          opts={{ startIndex: selected }}
          onKeyDownCapture={onKey}
          className="min-w-0 flex-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Next league" disabled={selected === last} onClick={() => step(1)}>
          <Icon name="chevron-right" size="md" />
        </Button>
      </div>
      <p aria-live="polite" className="sr-only">
        {slideName(LEAGUE_SLIDES[selected]!)}
      </p>
      <CarouselDots aria-label="Go to a league" count={LEAGUE_SLIDES.length} current={selected} onSelect={onSelect} label={(i) => `Go to ${slideName(LEAGUE_SLIDES[i]!)}`} />
    </div>
  );
}
