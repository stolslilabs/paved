import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CAMPAIGNS, EMPTY_PROGRESS, recordRun } from "@paved/game-core";
import { StoryScene } from "../src/components/scenes/story-scene";
import { Carousel, CarouselContent, CarouselItem, useCarouselSettled, type CarouselApi } from "../src/components/ui/carousel";

// Embla as is, its last API kept: StoryScene does not hand it out.
const embla = vi.hoisted(() => ({ api: undefined as CarouselApi }));
vi.mock("embla-carousel-react", async (original) => {
  const { default: useEmblaCarousel } = await original<typeof import("embla-carousel-react")>();
  return {
    default: (...args: Parameters<typeof useEmblaCarousel>) => {
      const result = useEmblaCarousel(...args);
      embla.api = result[1];
      return result;
    },
  };
});

const wrap = (ui: ReactNode, reducedMotion: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reducedMotion}>{ui}</MotionConfig>
  </LazyMotion>
);
// Under a loaded run Embla and the first frames can take seconds: the waits allow 5 s (the suite allows 15 s a test).
const frames = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** A carousel that reports its API and whether it is at rest. */
function Demo({ start, onApi }: { start?: number; onApi: (api: CarouselApi) => void }) {
  const [api, setApi] = useState<CarouselApi>();
  const settled = useCarouselSettled(api);
  return (
    <Carousel
      aria-label="Campaigns"
      opts={start === undefined ? undefined : { startIndex: start }}
      setApi={(a) => {
        onApi(a);
        setApi(a);
      }}
    >
      <CarouselContent data-settled={settled}>
        {["One", "Two", "Three"].map((name) => (
          <CarouselItem key={name}>{name}</CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}

/** The Tutorial at 2 stars a level: the second campaign opens. */
function progressOpeningTheSecond() {
  let progress = EMPTY_PROGRESS;
  for (const level of CAMPAIGNS[0]!.levels) progress = recordRun(progress, level, { campaignId: 1, levelIndex: level.id, moves: [] }, Math.ceil(level.target * 0.7));
  return progress;
}

describe("Carousel and the campaign unlock: one motion at a time (#615)", () => {
  it("reads startIndex once: a later choice never re-inits Embla (a jump that cuts the scroll under way)", async () => {
    let api: CarouselApi;
    const { rerender } = render(wrap(<Demo start={1} onApi={(a) => (api = a)} />));
    await waitFor(() => expect(api).toBeDefined(), { timeout: 5000 });
    const reInit = vi.spyOn(api!, "reInit");
    rerender(wrap(<Demo start={0} onApi={(a) => (api = a)} />));
    rerender(wrap(<Demo start={2} onApi={(a) => (api = a)} />));
    expect(reInit).not.toHaveBeenCalled();
  });

  it("is at rest once Embla settles when it opens on a scroll, and at once when it opens still", async () => {
    let api: CarouselApi;
    render(
      wrap(
        <Demo
          onApi={(a) => {
            api = a;
            // A scroll under way when the carousel mounts.
            if (a) vi.spyOn(a.internalEngine().scrollBody, "settled").mockReturnValue(false);
          }}
        />,
      ),
    );
    await waitFor(() => expect(api).toBeDefined(), { timeout: 5000 });
    const track = () => document.querySelector("[data-slot='carousel-content'] > div");
    await frames();
    expect(track()).toHaveAttribute("data-settled", "false");
    act(() => api!.emit("settle"));
    expect(track()).toHaveAttribute("data-settled", "true");
  });

  it("the unlocked card holds its locked look until the carousel is at rest, then plays the unlock", async () => {
    render(wrap(<StoryScene campaigns={CAMPAIGNS} progress={progressOpeningTheSecond()} campaignId={2} justUnlocked={[2]} />));
    const card = () => document.querySelector("[data-campaign='2']");
    // The first render: no carousel API yet, so the track is not known to be at rest.
    expect(card()).toHaveAttribute("data-unlock", "paused");
    await waitFor(() => expect(card()).toHaveAttribute("data-unlock", "playing"), { timeout: 5000 });
    expect(card()).toHaveAttribute("data-status", "unlocking");
  });

  it("under reduced motion the card is open at once: nothing to sequence", () => {
    render(wrap(<StoryScene campaigns={CAMPAIGNS} progress={progressOpeningTheSecond()} campaignId={2} justUnlocked={[2]} />, "always"));
    const card = screen.getByRole("button", { name: /Open Country/ });
    expect(card).toHaveAttribute("data-status", "open");
    expect(card).not.toHaveAttribute("data-unlock");
  });

  for (const reduced of ["never", "always"] as const) {
    it(`a press on a card brings it in view, a jump under reduced motion (${reduced})`, async () => {
      embla.api = undefined;
      render(wrap(<StoryScene campaigns={CAMPAIGNS} progress={progressOpeningTheSecond()} campaignId={2} />, reduced));
      await waitFor(() => expect(embla.api).toBeDefined(), { timeout: 5000 });
      const scrollTo = vi.spyOn(embla.api!, "scrollTo");
      fireEvent.click(screen.getByRole("button", { name: /Tutorial/ }));
      expect(scrollTo).toHaveBeenCalledWith(0, reduced === "always");
    });

    it(`a swipe's release glides to its snap, and lands there at once under reduced motion (${reduced})`, async () => {
      let api: CarouselApi;
      render(wrap(<Demo start={1} onApi={(a) => (api = a)} />, reduced));
      await waitFor(() => expect(api).toBeDefined(), { timeout: 5000 });
      const scrollTo = vi.spyOn(api!, "scrollTo");
      act(() => api!.emit("pointerUp"));
      if (reduced === "always") expect(scrollTo).toHaveBeenCalledWith(api!.selectedScrollSnap(), true);
      else expect(scrollTo).not.toHaveBeenCalled();
    });
  }
});
