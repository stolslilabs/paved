import { fireEvent, render, screen, within } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CAMPAIGNS, EMPTY_PROGRESS, PlanType, recordRun } from "@paved/game-core";
import { CampaignCard } from "../src/components/containers/campaign-card";
import { DeckPresentation } from "../src/components/containers/story-panels";
import { StoryScene } from "../src/components/scenes/story-scene";

const wrap = (ui: ReactNode, reducedMotion: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reducedMotion}>{ui}</MotionConfig>
  </LazyMotion>
);
const CARD = { id: 2, name: "Open Country", summary: "Longer games.", levels: 11, stars: 0, plans: [1, 2, 3] } as const;

describe("Story campaign cards (#592)", () => {
  it("a locked card says which campaign to finish first (STORY-PAGE: the Tutorial opens every other one)", () => {
    render(wrap(<CampaignCard {...CARD} status="locked" opensAfter="Tutorial" />));
    expect(screen.getByRole("article")).toHaveTextContent("Finish the Tutorial to open");
  });

  it("the unlock plays with motion and is skipped under reduced motion: the card is open at once", () => {
    const { unmount } = render(wrap(<CampaignCard {...CARD} status="unlocking" />));
    expect(screen.getByRole("article")).toHaveAttribute("data-status", "unlocking");
    unmount();
    render(wrap(<CampaignCard {...CARD} status="unlocking" />, "always"));
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
    fireEvent.click(screen.getByRole("button", { name: /^Play level 3, / }));
    expect(onLevel).toHaveBeenLastCalledWith(1, 3);
    fireEvent.click(within(levels).getByRole("button", { name: /^Level 1, / }));
    expect(onLevel).toHaveBeenLastCalledWith(1, 1);
    const locked = within(levels).getByRole("button", { name: /^Level 4, .*, locked$/ });
    expect(locked.querySelector("img[data-icon='lock']")).not.toBeNull();
  });

  it("a locked campaign: the carved box says how many Tutorial levels are left, the footer's Play is disabled", () => {
    let progress = EMPTY_PROGRESS;
    for (const level of CAMPAIGNS[0]!.levels.slice(0, 8)) progress = recordRun(progress, level, { campaignId: 1, levelIndex: level.id, moves: [] }, level.target);
    render(wrap(<StoryScene campaigns={CAMPAIGNS} progress={progress} campaignId={2} />));
    const levels = screen.getByRole("region", { name: "Open Country" });
    expect(levels.querySelector("[data-slot='campaign-locked']")).toHaveTextContent("Finish every level of the Tutorial to open it: 4 levels left.");
    expect(screen.getByRole("button", { name: "Play, locked" })).toBeDisabled();
    expect(levels.querySelectorAll("[data-next]")).toHaveLength(0);
  });

  it("draw the campaign's background from the build in its theme, both widths in its srcset, blurred while locked; its tiles without one", () => {
    // The build's backgrounds: Open Country's in Default (theme 0), none in Forest.
    const renders = (theme: number, key: string) => (theme === 0 && key.startsWith("story-2-") ? `/renderer-assets/renders/${key}.${theme}.0123456789.webp` : null);
    const background = (container: HTMLElement) => container.querySelector("img[data-background]");
    const { container, rerender } = render(wrap(<CampaignCard {...CARD} status="open" renders={renders} />));
    const image = background(container)!;
    expect(image).toHaveAttribute("data-background", "2");
    expect(image).toHaveAttribute("srcset", "/renderer-assets/renders/story-2-720.0.0123456789.webp 720w, /renderer-assets/renders/story-2-1040.0.0123456789.webp 1040w");
    expect(image).toHaveAttribute("src", "/renderer-assets/renders/story-2-1040.0.0123456789.webp");
    expect(image).toHaveAttribute("sizes");
    expect(image).not.toHaveClass("blur-[14px]");
    rerender(wrap(<CampaignCard {...CARD} status="locked" missing={3} renders={renders} />));
    expect(background(container)).toHaveClass("blur-[14px]");
    // In a theme the build has no background for: the mosaic of its tiles, as before.
    rerender(wrap(<CampaignCard {...CARD} status="open" theme={1} renders={renders} />));
    expect(background(container)).toBeNull();
    expect(container.querySelector(".grid-cols-4")).not.toBeNull();
  });

  it("three campaign cards and nothing else: no card announces a campaign to come (#721)", () => {
    render(wrap(<StoryScene campaigns={CAMPAIGNS} progress={EMPTY_PROGRESS} />));
    const cards = screen.getByRole("region", { name: "Campaigns" });
    expect([...cards.querySelectorAll("article[data-campaign]")].map((a) => a.getAttribute("data-campaign"))).toEqual(["1", "2", "3"]);
    expect(cards).not.toHaveTextContent(/on the way|coming soon/i);
    expect(cards.querySelectorAll("[data-slot='carousel-item']")).toHaveLength(3);
  });
});

describe("a level's intro (#593, #721)", () => {
  const ids = (deck: readonly PlanType[]) => deck.map((plan) => Object.values(PlanType).indexOf(plan));

  for (const campaign of CAMPAIGNS) {
    it(`every level of ${campaign.name} opens on its title, intro, tiles in draw order and its tip, set apart with a bulb and a label`, () => {
      for (const level of campaign.levels) {
        const { unmount } = render(
          wrap(<DeckPresentation campaign={campaign.name} levelIndex={level.id} title={level.title} intro={level.intro} tip={level.tip} deck={ids(level.deck)} theme={campaign.theme} />),
        );
        const intro = screen.getByTestId("deck-presentation");
        expect(within(intro).getByRole("heading", { name: level.title })).toBeInTheDocument();
        expect(intro).toHaveTextContent(level.intro);
        expect([...within(intro).getByTestId("presented-tiles").querySelectorAll("li")].map((li) => Number(li.getAttribute("data-plan")))).toEqual(ids(level.deck));
        const tip = within(intro).getByRole("complementary", { name: "Tip" });
        expect(tip).toHaveTextContent(`Tip${level.tip}`);
        expect(tip.querySelector("[data-icon='lightbulb']")).not.toBeNull();
        // Never a star threshold, in the tip or anywhere on the intro.
        expect(intro).not.toHaveTextContent(String(level.target));
        unmount();
      }
    });
  }

  it("draws its tiles in the campaign's theme, the base render for a plan the theme has none of; no tip, no block", () => {
    const renders = (theme: number, key: string) => (theme === 1 && key === "ccccccccc" ? null : `/r/${key}.${theme}.webp`);
    const deck = ids([PlanType.RFRFFFFFR, PlanType.CCCCCCCCC]);
    render(wrap(<DeckPresentation campaign="Dark Forest" levelIndex={1} title="Pines" intro="Into the woods." deck={deck} theme={1} renders={renders} />));
    const tiles = [...screen.getByTestId("presented-tiles").querySelectorAll("li")];
    expect(tiles.map((li) => li.getAttribute("data-theme"))).toEqual(["1", "0"]);
    expect(tiles.map((li) => li.querySelector("img")?.getAttribute("src"))).toEqual(["/r/rfrfffffr.1.webp", "/r/ccccccccc.0.webp"]);
    expect(screen.queryByTestId("level-tip")).toBeNull();
  });
});
