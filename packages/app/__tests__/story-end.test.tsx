import { render, screen, within } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { TUTORIAL, levelResult } from "@paved/game-core";
import { endXp } from "../src/components/containers/game-end";
import { StoryEnd } from "../src/components/containers/story-panels";
import { pointsToNextStar, storyStarFills } from "../src/routes/pages/story-board";

const wrap = (ui: ReactNode) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="always">{ui}</MotionConfig>
  </LazyMotion>
);
const END = { title: "First stone", score: 300, stars: 2 as const, onReplay: vi.fn(), onNext: vi.fn(), onLevels: vi.fn() };
const answers = () => within(screen.getByTestId("story-end")).getAllByRole("button").filter((b) => ["Retry", "Levels", "Next"].includes(b.textContent ?? ""));

describe("Story's end (STORY-PAGE, after the Ranked end)", () => {
  it("Retry, Levels and Next on one row, Levels raised grey as Retry; with no level after it, Retry and Levels in gold", () => {
    const { rerender } = render(wrap(<StoryEnd {...END} />));
    expect(answers().map((b) => b.textContent)).toEqual(["Retry", "Levels", "Next"]);
    expect(answers()[0]!.parentElement).toHaveClass("grid-cols-3");
    expect(answers()[1]).toHaveClass("drawer-raised");
    expect(answers()[2]).not.toHaveClass("drawer-raised");
    rerender(wrap(<StoryEnd {...END} onNext={undefined} />));
    expect(answers().map((b) => b.textContent)).toEqual(["Retry", "Levels"]);
    expect(answers()[0]!.parentElement).toHaveClass("grid-cols-2");
    expect(answers()[1]).not.toHaveClass("drawer-raised");
  });

  it("no star: \"Level failed\", Retry the gold answer, Next disabled in its place (a control never leaves)", () => {
    render(wrap(<StoryEnd {...END} stars={0} onNext={undefined} nextLocked />));
    expect(screen.getByRole("heading", { name: "Level failed" })).toBeInTheDocument();
    expect(answers().map((b) => b.textContent)).toEqual(["Retry", "Levels", "Next"]);
    expect(answers()[0]).toHaveAttribute("data-tone", "gold");
    expect(answers()[2]).toHaveAttribute("data-tone", "raised");
    expect(answers()[2]).toBeDisabled();
  });

  it("the best, a new best with the one before it, and the points the next star was missing, never its threshold", () => {
    const level = TUTORIAL.levels[0]!;
    const result = levelResult(level, 300);
    render(wrap(<StoryEnd {...END} previousBest={260} toNextStar={pointsToNextStar(result, 300)} />));
    const best = screen.getByRole("region", { name: "Best" });
    expect(best).toHaveAttribute("data-record");
    expect(best).toHaveTextContent("300New best!260 → 300");
    expect(screen.getByTestId("to-next-star")).toHaveTextContent("21 points short of the next star");
    expect(screen.getByTestId("story-end")).not.toHaveTextContent(String(level.target));
  });

  it("the XP row only when the run's report gave some", () => {
    const { rerender } = render(wrap(<StoryEnd {...END} />));
    expect(screen.queryByRole("region", { name: "Experience" })).toBeNull();
    rerender(wrap(<StoryEnd {...END} xp={endXp(1_480, 0)} />));
    expect(screen.queryByRole("region", { name: "Experience" })).toBeNull();
    rerender(wrap(<StoryEnd {...END} xp={endXp(1_480, 10)} />));
    expect(screen.getByRole("region", { name: "Experience" })).toHaveTextContent("+10 XP");
  });

  it("the level's chest: to open, or why this run won none (already won, 3 stars win it)", () => {
    const { rerender } = render(wrap(<StoryEnd {...END} chest={{ state: "won", rank: "rare" }} />));
    expect(screen.getByRole("button", { name: "Open the rare chest" })).toBeEnabled();
    rerender(wrap(<StoryEnd {...END} chest={{ state: "already", rank: "rare" }} />));
    expect(screen.getByRole("region", { name: "Chest" })).toHaveTextContent("Chest already wonThis level's rare chest is yours.");
    rerender(wrap(<StoryEnd {...END} chest={{ state: "missed", rank: "epic" }} />));
    expect(screen.getByRole("region", { name: "Chest" })).toHaveTextContent("No chest this time3 stars win this level's epic chest.");
  });

  it("the stars fill by shares of the score: the first full, the second up to 2 stars, the third up to the target", () => {
    expect(storyStarFills({ twoStars: 225, target: 321 }, 0)).toEqual([1, 0, 0]);
    expect(storyStarFills({ twoStars: 225, target: 321 }, 180)).toEqual([1, 0.8, 0]);
    expect(storyStarFills({ twoStars: 225, target: 321 }, 273)).toEqual([1, 1, 0.5]);
    expect(storyStarFills({ twoStars: 225, target: 321 }, 400)).toEqual([1, 1, 1]);
  });
});
