import { slow } from "../test-slow";
import { render, screen, within } from "@testing-library/react";
import { afterAll, describe, expect, it } from "vitest";
import { OverScene } from "../src/components/scenes/over-scene";
import { CLOSINGS_38 } from "../src/mocks/board";
import { OVER } from "../src/mocks/scenes";
import { pts, settleOverChunks, wrap } from "./scenes-helpers";

describe("Over", () => {
  // Every chunk the over scene started loaded before the file ends (`scenes-helpers.tsx`).
  afterAll(settleOverChunks, slow(30_000));

  it("shows the final score, the metrics, every closing and the reward", () => {
    render(wrap(<OverScene {...OVER.rewarded} />));
    expect(within(screen.getByTestId("final-score")).getByTestId("score-value")).toHaveTextContent(pts(OVER.rewarded.game.score));
    expect(screen.getByText("New best")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Closings" })).getAllByRole("listitem")).toHaveLength(CLOSINGS_38.length);
    const reward = screen.getByRole("region", { name: "Reward" });
    expect(reward).toHaveAttribute("data-state", "rewarded");
    expect(reward).toHaveTextContent("8.42");
    expect(reward).toHaveTextContent("beaten by 120");
  });

  it.each([
    ["awaiting", /after the day closes/],
    ["settle", /Settle and claim/],
    ["below", /stake is lost/],
    ["expired", /within 24 h/],
  ] as const)("tells the %s reward state", (state, text) => {
    render(wrap(<OverScene {...OVER[state]} />));
    expect(screen.getByRole("region", { name: "Reward" })).toHaveTextContent(text);
  });

  it("Training's end (TRAINING-END) has no reward to tell: no stake, nothing to settle", () => {
    render(wrap(<OverScene {...OVER.training} />));
    expect(screen.queryByRole("region", { name: "Reward" })).toBeNull();
    expect(within(screen.getByTestId("final-score")).getByTestId("score-value")).toHaveTextContent(pts(OVER.training.game.score));
  });

  it("says so when the game closed nothing", () => {
    render(wrap(<OverScene {...OVER.noClosing} />));
    expect(screen.getByText("No structure closed in this game.")).toBeInTheDocument();
  });
});
