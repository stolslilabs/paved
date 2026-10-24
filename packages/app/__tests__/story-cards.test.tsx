import { render, screen, within } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { CAMPAIGNS, EMPTY_PROGRESS, recordRun } from "@paved/game-core";
import { CampaignCard } from "../src/components/containers/story-panels";
import { StoryScene } from "../src/components/scenes/story-scene";

const wrap = (ui: ReactNode, reducedMotion: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reducedMotion}>{ui}</MotionConfig>
  </LazyMotion>
);
const CARD = { id: 2, name: "Open Country", summary: "Longer games.", levels: 11, stars: 0, plans: [1, 2, 3] } as const;

describe("Story campaign cards (#592)", () => {
  it("a locked card states the stars it still needs; one star reads singular", () => {
    const { rerender } = render(wrap(<CampaignCard {...CARD} status="locked" missing={24} />));
    expect(screen.getByRole("button")).toHaveTextContent("24 more stars to open");
    rerender(wrap(<CampaignCard {...CARD} status="locked" missing={1} />));
    expect(screen.getByRole("button")).toHaveTextContent("1 more star to open");
  });

  it("the unlock plays with motion and is skipped under reduced motion: the card is open at once", () => {
    const { unmount } = render(wrap(<CampaignCard {...CARD} status="unlocking" />));
    expect(screen.getByRole("button")).toHaveAttribute("data-status", "unlocking");
    unmount();
    render(wrap(<CampaignCard {...CARD} status="unlocking" />, "always"));
    expect(screen.getByRole("button")).toHaveAttribute("data-status", "open");
    expect(screen.getByRole("button")).not.toHaveTextContent("to open");
  });

  it("every level title keeps one line (ellipsis) with the full title in its title attribute", () => {
    let progress = EMPTY_PROGRESS;
    for (const level of CAMPAIGNS[0]!.levels) progress = recordRun(progress, level, { campaignId: 1, levelIndex: level.id, moves: [] }, level.target);
    render(wrap(<StoryScene campaigns={CAMPAIGNS} progress={progress} campaignId={1} />));
    const levels = screen.getByRole("region", { name: "Tutorial" });
    const longest = within(levels).getByRole("button", { name: /The price of a discard/ });
    expect(longest).toHaveAttribute("title", "The price of a discard");
    expect(longest).toHaveClass("h-16");
    for (const title of within(levels).getAllByTestId("level-title")) expect(title).toHaveClass("truncate");
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
});
