import { fireEvent, render, screen, within } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CAMPAIGNS, EMPTY_PROGRESS, PlanType, recordRun } from "@paved/game-core";
import { CampaignHero } from "../src/components/containers/campaign-hero";
import { DeckPresentation, StoryCoach } from "../src/components/containers/story-panels";
import { StoryScene } from "../src/components/scenes/story-scene";

const wrap = (ui: ReactNode, reducedMotion: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reducedMotion}>{ui}</MotionConfig>
  </LazyMotion>
);
const CARD = { id: 2, name: "Open Country", summary: "Longer games.", levels: 11, stars: 0, plans: [1, 2, 3] } as const;

describe("Story's campaigns (#592; STORY-PAGE: written on their picture, no card)", () => {
  it("a locked campaign says which campaign to finish first (STORY-PAGE: the Tutorial opens every other one)", () => {
    render(wrap(<CampaignHero {...CARD} status="locked" opensAfter="Tutorial" />));
    expect(screen.getByRole("article")).toHaveTextContent("Finish the Tutorial to open");
  });

  it("the unlock plays with motion and is skipped under reduced motion: the campaign is open at once", () => {
    const { unmount } = render(wrap(<CampaignHero {...CARD} status="unlocking" />));
    expect(screen.getByRole("article")).toHaveAttribute("data-status", "unlocking");
    unmount();
    render(wrap(<CampaignHero {...CARD} status="unlocking" />, "always"));
    expect(screen.getByRole("article")).toHaveAttribute("data-status", "open");
    expect(screen.getByRole("article")).not.toHaveTextContent("to open");
  });

  it("every level title wraps rather than truncates (STORY-PAGE: titles wrap at 320 px), its full title in its title attribute", () => {
    let progress = EMPTY_PROGRESS;
    for (const level of CAMPAIGNS[0]!.levels) progress = recordRun(progress, level, { campaignId: 1, levelIndex: level.id, moves: [] }, level.target);
    render(wrap(<StoryScene campaigns={CAMPAIGNS} progress={progress} campaignId={1} />));
    const levels = screen.getByRole("region", { name: "Tutorial" });
    const longest = within(levels).getByRole("button", { name: /The price of a discard/ });
    expect(longest).toHaveAttribute("title", "The price of a discard");
    expect(longest).toHaveClass("min-h-14");
    for (const title of within(levels).getAllByTestId("level-title")) {
      expect(title).not.toHaveClass("truncate");
      expect(title).toHaveClass("wrap-anywhere");
    }
  });

  it("every row keeps its painted stars; the last level unlocked is the current one and the footer's gold Play plays it; a locked one the painted lock", () => {
    // Level 1 at 1 star, level 2 at 2 stars: level 3 is the last unlocked, the one Play plays; 1 and 2 stay a tap away.
    const [one, two] = CAMPAIGNS[0]!.levels;
    let progress = recordRun(EMPTY_PROGRESS, one!, { campaignId: 1, levelIndex: 1, moves: [] }, 0);
    progress = recordRun(progress, two!, { campaignId: 1, levelIndex: 2, moves: [] }, Math.ceil(two!.target * 0.7));
    const onLevel = vi.fn();
    render(wrap(<StoryScene campaigns={CAMPAIGNS} progress={progress} campaignId={1} onLevel={onLevel} />));
    const levels = screen.getByRole("region", { name: "Tutorial" });
    expect(within(within(levels).getByRole("button", { name: /^Level 1, / })).getByRole("img", { name: "1 of 3 stars" }).querySelectorAll("img[data-icon='star']")).toHaveLength(3);
    expect(within(within(levels).getByRole("button", { name: /^Level 2, / })).getByRole("img", { name: "2 of 3 stars" })).toBeInTheDocument();
    expect(within(within(levels).getByRole("button", { name: /^Level 3, / })).getByRole("img", { name: "0 of 3 stars" })).toBeInTheDocument();
    expect(levels.querySelector("svg[data-icon='star']")).toBeNull();
    expect(levels.querySelectorAll("[data-next]")).toHaveLength(1);
    expect(within(levels).getByRole("button", { name: /^Level 3, / })).toHaveAttribute("aria-current", "step");
    // A row's wash takes its place's shape in the list (the owner's rule of 2026-11-07): square between two rows.
    const shape = (n: number) => [...within(levels).getByRole("button", { name: new RegExp(`^Level ${n}, `) }).classList].filter((c) => c.startsWith("rounded"));
    expect(shape(1)).toEqual(["rounded-none", "rounded-t-xl"]);
    expect(shape(3)).toEqual(["rounded-none"]);
    expect(shape(CAMPAIGNS[0]!.levels.length)).toEqual(["rounded-none", "rounded-b-xl"]);
    fireEvent.click(screen.getByRole("button", { name: /^Play level 3, / }));
    expect(onLevel).toHaveBeenLastCalledWith(1, 3);
    fireEvent.click(within(levels).getByRole("button", { name: /^Level 1, / }));
    expect(onLevel).toHaveBeenLastCalledWith(1, 1);
    const locked = within(levels).getByRole("button", { name: /^Level 4, .*, locked$/ });
    expect(locked.querySelector("img[data-icon='lock']")).not.toBeNull();
  });

  it("a locked campaign: the head says what opens it, no box repeats it over its levels, the footer's Play is disabled", () => {
    let progress = EMPTY_PROGRESS;
    for (const level of CAMPAIGNS[0]!.levels.slice(0, 8)) progress = recordRun(progress, level, { campaignId: 1, levelIndex: level.id, moves: [] }, level.target);
    render(wrap(<StoryScene campaigns={CAMPAIGNS} progress={progress} campaignId={2} />));
    const levels = screen.getByRole("region", { name: "Open Country" });
    expect(screen.getByRole("article", { name: "Open Country" })).toHaveTextContent("Finish the Tutorial to open");
    expect(levels).not.toHaveTextContent(/Locked|levels left/);
    expect(screen.getByRole("button", { name: "Play, locked" })).toBeDisabled();
    expect(levels.querySelectorAll("[data-next]")).toHaveLength(0);
  });

  it("draw the campaign's background from the build in its theme, both widths in its srcset, blurred while locked; its tiles without one", () => {
    // The build's backgrounds: Open Country's in Default (theme 0), none in Forest.
    const renders = (theme: number, key: string) => (theme === 0 && key.startsWith("story-2-") ? `/renderer-assets/renders/${key}.${theme}.0123456789.webp` : null);
    const background = (container: HTMLElement) => container.querySelector("img[data-background]");
    const { container, rerender } = render(wrap(<CampaignHero {...CARD} status="open" renders={renders} />));
    const image = background(container)!;
    expect(image).toHaveAttribute("data-background", "2");
    expect(image).toHaveAttribute("srcset", "/renderer-assets/renders/story-2-720.0.0123456789.webp 720w, /renderer-assets/renders/story-2-1040.0.0123456789.webp 1040w");
    expect(image).toHaveAttribute("src", "/renderer-assets/renders/story-2-1040.0.0123456789.webp");
    expect(image).toHaveAttribute("sizes");
    expect(image).not.toHaveClass("blur-[14px]");
    rerender(wrap(<CampaignHero {...CARD} status="locked" renders={renders} />));
    expect(background(container)).toHaveClass("blur-[14px]");
    // In a theme the build has no background for: the mosaic of its tiles, as before.
    rerender(wrap(<CampaignHero {...CARD} status="open" theme={1} renders={renders} />));
    expect(background(container)).toBeNull();
    expect(container.querySelector(".grid-cols-4")).not.toBeNull();
  });

  it("three campaigns and nothing else: none announces a campaign to come (#721)", () => {
    render(wrap(<StoryScene campaigns={CAMPAIGNS} progress={EMPTY_PROGRESS} />));
    const cards = screen.getByRole("region", { name: "Campaigns" });
    expect([...cards.querySelectorAll("article[data-campaign]")].map((a) => a.getAttribute("data-campaign"))).toEqual(["1", "2", "3"]);
    expect(cards).not.toHaveTextContent(/on the way|coming soon/i);
    expect(cards.querySelectorAll("[data-slot='carousel-item']")).toHaveLength(3);
  });
});

describe("a level's intro (#593, #721; STORY-INTRO: the HUD's window over the board)", () => {
  const ids = (deck: readonly PlanType[]) => deck.map((plan) => Object.values(PlanType).indexOf(plan));
  const TUTORIAL_1 = CAMPAIGNS[0]!.levels[0]!;
  const intro = (props: Partial<Parameters<typeof DeckPresentation>[0]> = {}, reducedMotion: "never" | "always" = "never") =>
    render(
      wrap(
        <DeckPresentation campaign="Tutorial" campaignId={1} levelIndex={1} title={TUTORIAL_1.title} intro={TUTORIAL_1.intro} tip={TUTORIAL_1.tip} deck={ids(TUTORIAL_1.deck)} onStart={vi.fn()} {...props} />,
        reducedMotion,
      ),
    );

  for (const campaign of CAMPAIGNS) {
    it(`every level of ${campaign.name} opens on its title, intro, tiles in draw order and its tip, in a carved box under the painted bulb`, () => {
      for (const level of campaign.levels) {
        const { unmount } = render(
          wrap(<DeckPresentation campaign={campaign.name} campaignId={campaign.id} levelIndex={level.id} title={level.title} intro={level.intro} tip={level.tip} deck={ids(level.deck)} theme={campaign.theme} />),
        );
        const intro = screen.getByTestId("deck-presentation");
        expect(within(intro).getByRole("heading", { level: 2, name: level.title })).toBeInTheDocument();
        expect(intro).toHaveTextContent(`${campaign.name} · Level ${level.id}`);
        expect(intro).toHaveTextContent(level.intro);
        // The deck page's section: the painted pile and "Deck" (TILE-COUNTS: no count in the title), then the tiles numbered in draw
        // order, the last number the deck's count.
        expect(within(intro).getByRole("heading", { level: 3, name: "Deck" })).toBeInTheDocument();
        const tiles = [...within(intro).getByTestId("presented-tiles").querySelectorAll("li")];
        expect(tiles.map((li) => Number(li.getAttribute("data-plan")))).toEqual(ids(level.deck));
        expect(tiles.map((li) => li.textContent)).toEqual(level.deck.map((_, i) => String(i + 1)));
        const tip = within(intro).getByRole("complementary", { name: "Tip" });
        expect(tip).toHaveTextContent(level.tip);
        expect(tip).toHaveClass("drawer-carved");
        expect(tip.querySelector("[data-icon='bulb']")).not.toBeNull();
        // Never a star threshold, in the tip or anywhere on the intro.
        expect(intro).not.toHaveTextContent(String(level.target));
        unmount();
      }
    });
  }

  it("draws its tiles from above in the campaign's theme, the base render for a plan the theme has none of; no tip, no box", () => {
    const renders = (theme: number, key: string) => (theme === 1 && key === "ccccccccc-top" ? null : `/r/${key}.${theme}.webp`);
    const deck = ids([PlanType.RFRFFFFFR, PlanType.CCCCCCCCC]);
    render(wrap(<DeckPresentation campaign="Dark Forest" levelIndex={1} title="Pines" intro="Into the woods." deck={deck} theme={1} renders={renders} />));
    const tiles = [...screen.getByTestId("presented-tiles").querySelectorAll("li")];
    expect(tiles.map((li) => li.getAttribute("data-theme"))).toEqual(["1", "0"]);
    expect(tiles.map((li) => li.querySelector("img")?.getAttribute("src"))).toEqual(["/r/rfrfffffr-top.1.webp", "/r/ccccccccc-top.0.webp"]);
    expect(screen.queryByTestId("level-tip")).toBeNull();
  });

  it("puts the campaign's picture behind the level's name, the theme's (Story's campaign head), and none without the campaign's id", () => {
    const renders = (theme: number, key: string) => (key.startsWith("story-") ? `/r/${key}.${theme}.webp` : null);
    const { unmount } = intro({ campaignId: 3, theme: 1, renders });
    expect(screen.getByTestId("deck-presentation").querySelector("[data-slot='intro-picture'] img")).toHaveAttribute("src", "/r/story-3-1040.1.webp");
    unmount();
    intro({ campaignId: undefined, renders });
    expect(screen.getByTestId("deck-presentation").querySelector("[data-slot='intro-picture']")).toBeNull();
  });

  it("a short deck's carved panel hugs its tiles at the deck page's size; four tiles and more fill the row, four a row", () => {
    const { unmount } = intro();
    const two = screen.getByTestId("presented-tiles");
    expect(two.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    expect(two.style.width).toContain("calc(");
    unmount();
    const long = CAMPAIGNS[1]!.levels[11]!;
    intro({ deck: ids(long.deck) });
    const fifteen = screen.getByTestId("presented-tiles");
    expect(fifteen.querySelectorAll("li")).toHaveLength(15);
    expect(fifteen.style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(fifteen.style.width).toBe("100%");
  });

  it("shows the device's best and its painted stars by Start, or writes out that there is none yet", () => {
    const { unmount } = intro({ best: { score: 10200, stars: 2 } });
    const best = screen.getByRole("region", { name: "Your best: 10,200, 2 of 3 stars" });
    expect(best).toHaveTextContent("10,200");
    expect(within(best).getByRole("img", { name: "2 of 3 stars", hidden: true })).toBeInTheDocument();
    unmount();
    intro({ best: null });
    expect(screen.getByRole("region", { name: "No best yet" })).toHaveTextContent("No best yet");
  });

  it("starts from its one gold action, Escape or a tap anywhere; Start is focused and shines", async () => {
    const onStart = vi.fn();
    intro({ onStart });
    const start = screen.getByRole("button", { name: "Start" });
    expect(start).toHaveFocus();
    expect(start.querySelector("[data-slot='gold-shine']")).not.toBeNull();
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(start, { key: "Escape" });
    expect(onStart).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText(TUTORIAL_1.intro));
    expect(onStart).toHaveBeenCalledTimes(3);
  });

  it("under reduced motion the window and every tile are there at once", () => {
    intro({}, "always");
    for (const li of screen.getByTestId("presented-tiles").querySelectorAll("li")) expect((li as HTMLElement).style.opacity).not.toBe("0");
    expect(screen.getByTestId("level-tip").style.opacity).not.toBe("0");
  });

  // #1090: a long deck (Open Country 12) on a short phone (568 px tall) opened on its foot, the focus on Start scrolling the window down
  // at once (scrollTop 222 to 250 at 320, 360 and 375 in Chromium). jsdom lays nothing out: its focus is given the browser's scroll into
  // view (the scroller to the focused control, unless `preventScroll`), with the measured offset.
  for (const width of [320, 360, 375]) {
    it(`a long deck opens at its head on a short phone (${width} x 568): Start focused, the window not scrolled`, () => {
      vi.stubGlobal("innerWidth", width);
      vi.stubGlobal("innerHeight", 568);
      const scrolled = new Map<Element, number>();
      const focus = HTMLElement.prototype.focus;
      const spy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
        const scroller = this.closest("[data-slot='scroll-region']");
        if (scroller && !options?.preventScroll) scrolled.set(scroller, 250);
        focus.call(this, options);
      });
      try {
        const country = CAMPAIGNS[1]!;
        const level = country.levels[11]!;
        intro({ campaign: country.name, campaignId: country.id, levelIndex: level.id, title: level.title, intro: level.intro, tip: level.tip, deck: ids(level.deck) });
        expect(level.deck.length).toBeGreaterThan(8);
        const scroller = screen.getByTestId("deck-presentation").querySelector("[data-slot='scroll-region']")!;
        expect(screen.getByRole("button", { name: "Start" })).toHaveFocus();
        expect(scrolled.get(scroller) ?? scroller.scrollTop).toBe(0);
        expect(screen.getByRole("button", { name: "Start" })).not.toHaveAttribute("autofocus");
      } finally {
        spy.mockRestore();
        vi.unstubAllGlobals();
      }
    });
  }
});

describe("a coach mark (#546; STORY-INTRO: the tip's look on the HUD's frame)", () => {
  it("shows its tip by the painted bulb, on the HUD's frame, and Got it puts it away", () => {
    const onDismiss = vi.fn();
    render(wrap(<StoryCoach tip="Tap the tile stack." onDismiss={onDismiss} />));
    const coach = screen.getByTestId("story-coach");
    expect(within(coach).getByRole("status")).toHaveTextContent("Tap the tile stack.");
    expect(coach.querySelector("[data-icon='bulb']")).not.toBeNull();
    expect(coach.querySelector("[data-slot='hud-frame']")).not.toBeNull();
    fireEvent.click(within(coach).getByRole("button", { name: "Got it" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
