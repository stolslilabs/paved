import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { useReducedMotionConfig } from "motion/react";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { LEAGUES, type League } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "../ui/carousel";
import { Icon } from "../ui/icon";
import { crestClass } from "../elements/league-crest";

export interface LeagueCarouselProps {
  /** The league in view, `LEAGUES`' index (0 Unranked to 22 Legend). */
  selected: number;
  onSelect: (index: number) => void;
  /** The player's league, marked "You". */
  mine: number;
  className?: string;
}

/**
 * The leagues one per view (#785), Unranked to Legend: the arrows, a swipe and the arrow keys move through them, and stop at
 * both ends. The index is the scene's: Embla follows it (a cut under reduced motion) and reports a swipe's landing. Only the
 * league in view is in the accessibility tree.
 */
export function LeagueCarousel({ selected, onSelect, mine, className }: LeagueCarouselProps) {
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

  // An arrow, a key or "Back to my league": Embla glides there, or cuts under reduced motion.
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

  const league = LEAGUES[selected]!;
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
              <LeagueSlide key={l.index} league={l} mine={l.index === mine} current={l.index === selected} />
            ))}
          </CarouselContent>
        </Carousel>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Next league" disabled={selected === last} onClick={() => step(1)}>
          <Icon name="chevron-right" size="md" />
        </Button>
      </div>
      <p aria-live="polite" data-testid="league-position" className="text-xs text-muted-foreground">
        {league.name} · <span className="numeric">{formatInteger(selected + 1)}</span> of <span className="numeric">{formatInteger(LEAGUES.length)}</span>
      </p>
      {selected !== mine && (
        <Button variant="secondary" size="sm" className="rounded-full" onClick={() => onSelect(mine)}>
          Back to my league
        </Button>
      )}
    </div>
  );
}

function LeagueSlide({ league, mine, current }: { league: League; mine: boolean; current: boolean }) {
  return (
    <CarouselItem aria-label={league.name} aria-current={mine ? "true" : undefined} aria-hidden={current ? undefined : true} inert={!current} data-league={league.index}>
      <div className="flex flex-col items-center gap-2 py-3 text-center">
        <Icon name="shield-halved" size="2xl" className={crestClass(league.id)} />
        <h2 className="font-display text-2xl">{league.name}</h2>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", mine ? "bg-primary/15 text-primary" : "invisible")}>You</span>
      </div>
    </CarouselItem>
  );
}
