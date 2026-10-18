import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { baseDeckPlans, deckSheetCounts, PlanType } from "@paved/game-core";
import { DeckSheet } from "../src/components/containers/deck-sheet";
import { TilesLeft } from "../src/components/elements/tiles-left";

const id = (plan: PlanType) => Object.values(PlanType).indexOf(plan);

describe("DeckSheet", () => {
  const counts = deckSheetCounts(baseDeckPlans(), [id(PlanType.CCCCCFFFC), id(PlanType.CCCCCFFFC), id(PlanType.CCCCCCCCC)], 2);

  it("shows 72 chips and crosses out the played ones", () => {
    render(<DeckSheet open onOpenChange={() => {}} counts={counts} handPlan={id(PlanType.CCCCCFFFC)} side="bottom" />);
    const plans = screen.getByTestId("deck-plans");
    expect(within(plans).getAllByRole("img")).toHaveLength(72);
    expect(plans.querySelectorAll("[data-out='true']")).toHaveLength(3);
    expect(plans.querySelectorAll("[data-state='selected']")).toHaveLength(1);
    expect(screen.getByText(/some never come/)).toBeInTheDocument();
    expect(screen.getByTestId("deck-summary")).toHaveTextContent("3 of 72 on the board, 69 not yet. 2 discarded.");
  });

  it("opens from the Tiles left button", async () => {
    const onClick = vi.fn();
    render(<TilesLeft remaining={12} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: /Show the deck/ }));
    expect(onClick).toHaveBeenCalled();
  });
});
