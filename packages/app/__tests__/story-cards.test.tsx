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
});
