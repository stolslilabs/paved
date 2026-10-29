import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import { cn } from "../../lib/utils";
import { LEAGUES, type League } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "../ui/carousel";
import { CarouselDots } from "../ui/carousel-dots";
import { Icon } from "../ui/icon";

export interface LeagueCarouselProps {
  /** The league in view, `LEAGUES`' index (0 Wood to 22 Grand Master). */
  selected: number;
  onSelect: (index: number) => void;
  /** The player's league (`aria-current`). */
  mine: number;
  /** A league's card (`LeagueCard`), the same height for every league (#833). */
  children: (league: League, current: boolean) => ReactNode;
  className?: string;
}

/**
 * The leagues one per view (#785), Wood to Grand Master: the arrows, a swipe, the arrow keys and the dots under it (#833, one
 * per league, the current one widened, a tap jumps there) move through them, and stop at both ends. The index is the scene's: Embla follows it (a cut under reduced motion) and reports a swipe's landing. Only the
 * league in view is in the accessibility tree.
 */
export function LeagueCarousel({ selected, onSelect, mine, children, className }: LeagueCarouselProps) {
  const [api, setApi] = useState<CarouselApi>();
  const reduced = useReducedMotionConfig();
  const last = LEAGUES.length - 1;
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

  // An arrow, a key, a dot or the card's back icon: Embla glides there, or cuts under reduced motion.
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
    <div className={cn("flex w-full min-w-0 flex-col items-center gap-2", className)}>
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
            {LEAGUES.map((l) => (
              <CarouselItem
                key={l.index}
                aria-label={l.name}
                aria-current={l.index === mine ? "true" : undefined}
                aria-hidden={l.index === selected ? undefined : true}
                inert={l.index !== selected}
                data-league={l.index}
              >
                {children(l, l.index === selected)}
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Next league" disabled={selected === last} onClick={() => step(1)}>
          <Icon name="chevron-right" size="md" />
        </Button>
      </div>
      <p aria-live="polite" className="sr-only">
        {LEAGUES[selected]!.name}
      </p>
      <CarouselDots aria-label="Go to a league" count={LEAGUES.length} current={selected} onSelect={onSelect} label={(i) => `Go to ${LEAGUES[i]!.name}`} />
    </div>
  );
}
