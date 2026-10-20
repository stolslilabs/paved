/*
 * Source: shadcn/ui's Carousel (apps/v4/registry/new-york-v4/ui/carousel.tsx, https://github.com/shadcn-ui/ui at commit
 * 0023018feb6e18c2f4aa0af2062f1c3107d90bfa, MIT, (c) 2023 shadcn), on Embla Carousel (`embla-carousel-react` 8.6.0,
 * https://www.embla-carousel.com, MIT, (c) David Jerleke). Adapted: reduced motion (from `MotionConfig`) makes
 * the buttons and the arrow keys jump instead of scroll, the `reInit` listener is removed on cleanup too, the region
 * takes an accessible name, F3's Button and icons, the semantic tokens; `startIndex` is read once, at mount, and
 * `useCarouselSettled` tells when the track is at rest.
 *
 * Embla is the one runtime beside Motion: it is the carousel engine the owner chose (embla-carousel.com), with its own
 * drag and snap physics, which Motion does not provide; it animates the track's scroll position, not the components.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ComponentProps, type KeyboardEvent } from "react";
import useEmblaCarousel, { type UseEmblaCarouselType } from "embla-carousel-react";
import { useReducedMotionConfig } from "motion/react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

export type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

type CarouselProps = {
  opts?: CarouselOptions;
  plugins?: CarouselPlugin;
  orientation?: "horizontal" | "vertical";
  setApi?: (api: CarouselApi) => void;
};

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: ReturnType<typeof useEmblaCarousel>[1];
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
} & CarouselProps;

const CarouselContext = createContext<CarouselContextProps | null>(null);

function useCarousel() {
  const context = useContext(CarouselContext);
  if (!context) throw new Error("useCarousel must be used within a <Carousel />");
  return context;
}

/**
 * Play's mode cards and the themes. Give it an `aria-label`: the region is a landmark. `opts.startIndex` is the slide it
 * opens on, read once: a later change would re-init Embla, which jumps to it and cuts the scroll under way.
 */
export function Carousel({ orientation = "horizontal", opts, setApi, plugins, className, children, ...props }: ComponentProps<"div"> & CarouselProps) {
  const [startIndex] = useState(opts?.startIndex);
  const [carouselRef, api] = useEmblaCarousel(
    { ...opts, ...(startIndex === undefined ? {} : { startIndex }), axis: orientation === "horizontal" ? "x" : "y" },
    plugins,
  );
  const reduced = useReducedMotionConfig();
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const onSelect = useCallback((api: CarouselApi) => {
    if (!api) return;
    setCanScrollPrev(api.canScrollPrev());
    setCanScrollNext(api.canScrollNext());
  }, []);

  // Embla's second argument is `jump`: no scroll animation under reduced motion.
  const scrollPrev = useCallback(() => api?.scrollPrev(Boolean(reduced)), [api, reduced]);
  const scrollNext = useCallback(() => api?.scrollNext(Boolean(reduced)), [api, reduced]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const [back, forward] = orientation === "horizontal" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
      if (event.key === back) {
        event.preventDefault();
        scrollPrev();
      } else if (event.key === forward) {
        event.preventDefault();
        scrollNext();
      }
    },
    [orientation, scrollPrev, scrollNext],
  );

  useEffect(() => {
    if (api && setApi) setApi(api);
  }, [api, setApi]);

  useEffect(() => {
    if (!api) return;
    onSelect(api);
    api.on("reInit", onSelect);
    api.on("select", onSelect);
    return () => {
      api.off("reInit", onSelect);
      api.off("select", onSelect);
    };
  }, [api, onSelect]);

  return (
    <CarouselContext.Provider value={{ carouselRef, api, opts, orientation, scrollPrev, scrollNext, canScrollPrev, canScrollNext }}>
      <div onKeyDownCapture={handleKeyDown} className={cn("relative", className)} role="region" aria-roledescription="carousel" data-slot="carousel" {...props}>
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

/**
 * Whether the carousel has come to rest since it mounted: at once when it opens still (Embla jumps to `startIndex`)
 * or is off (`active: false`, a breakpoint), else on Embla's `settle`, once its scroll ends and no finger holds it. A motion
 * that follows the carousel's own (a card's unlock) waits for it: one motion at a time. Stays true once true.
 */
export function useCarouselSettled(api: CarouselApi): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!api || settled) return;
    const done = () => setSettled(true);
    // A frame first: a scroll started in the same commit (a `scrollTo` from an effect) is under way by then.
    const frame = requestAnimationFrame(() => {
      const engine = api.internalEngine();
      if (!engine.options.active || (engine.scrollBody.settled() && !engine.dragHandler.pointerDown())) done();
    });
    api.on("settle", done);
    return () => {
      cancelAnimationFrame(frame);
      api.off("settle", done);
    };
  }, [api, settled]);
  return settled;
}

export function CarouselContent({ className, ...props }: ComponentProps<"div">) {
  const { carouselRef, orientation } = useCarousel();
  return (
    <div ref={carouselRef} className="overflow-hidden" data-slot="carousel-content">
      <div className={cn("flex", orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col", className)} {...props} />
    </div>
  );
}

export function CarouselItem({ className, ...props }: ComponentProps<"div">) {
  const { orientation } = useCarousel();
  return (
    <div
      role="group"
      aria-roledescription="slide"
      data-slot="carousel-item"
      className={cn("min-w-0 shrink-0 grow-0 basis-full", orientation === "horizontal" ? "pl-4" : "pt-4", className)}
      {...props}
    />
  );
}

export function CarouselPrevious({ className, variant = "outline", size = "icon", ...props }: ComponentProps<typeof Button>) {
  const { orientation, scrollPrev, canScrollPrev } = useCarousel();
  return (
    <Button
      data-slot="carousel-previous"
      variant={variant}
      size={size}
      className={cn(
        "absolute size-8 rounded-full",
        orientation === "horizontal" ? "top-1/2 -left-12 -translate-y-1/2" : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
        className,
      )}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      {...props}
    >
      <ChevronLeftIcon />
      <span className="sr-only">Previous slide</span>
    </Button>
  );
}

export function CarouselNext({ className, variant = "outline", size = "icon", ...props }: ComponentProps<typeof Button>) {
  const { orientation, scrollNext, canScrollNext } = useCarousel();
  return (
    <Button
      data-slot="carousel-next"
      variant={variant}
      size={size}
      className={cn(
        "absolute size-8 rounded-full",
        orientation === "horizontal" ? "top-1/2 -right-12 -translate-y-1/2" : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
        className,
      )}
      disabled={!canScrollNext}
      onClick={scrollNext}
      {...props}
    >
      <ChevronRightIcon />
      <span className="sr-only">Next slide</span>
    </Button>
  );
}
