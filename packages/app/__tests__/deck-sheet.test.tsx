import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { baseDeckPlans, deckSheetCounts, PlanType } from "@paved/game-core";
import { DeckSheet } from "../src/components/containers/deck-sheet";
import { LazyMotion, domMax } from "motion/react";
import { TileStack } from "../src/components/containers/tile-stack";
import BoardDeckSheet from "../src/components/containers/deck-sheet";
import { DECK_VIEW_KEY, deckView } from "../src/data/deck-view";

const id = (plan: PlanType) => Object.values(PlanType).indexOf(plan);

describe("DeckSheet", () => {
  const counts = deckSheetCounts(baseDeckPlans(), [id(PlanType.CCCCCFFFC), id(PlanType.CCCCCFFFC), id(PlanType.CCCCCCCCC)], [id(PlanType.FFFFFFCFF), id(PlanType.FFFFFFCFF)]);

  it("shows 72 chips and crosses out the played ones", () => {
    render(<DeckSheet open onOpenChange={() => {}} counts={counts} handPlan={id(PlanType.CCCCCFFFC)} side="bottom" />);
    const plans = screen.getByTestId("deck-plans");
    expect(within(plans).getAllByRole("img")).toHaveLength(72);
    expect(plans.querySelectorAll("[data-out='true']")).toHaveLength(5);
    expect(plans.querySelectorAll("[data-discarded='true']")).toHaveLength(2);
    expect(plans.querySelectorAll("[data-state='selected']")).toHaveLength(1);
    expect(screen.getByText(/some never come/)).toBeInTheDocument();
    expect(screen.getByTestId("deck-summary")).toHaveTextContent("3 played, 2 discarded (dashed), 67 not yet.");
  });

  it("opens from the tile stack, which carries the tiles left", async () => {
    const onDeck = vi.fn();
    render(
      <LazyMotion features={domMax}>
        <TileStack tile={{ plan: 1, orientation: 1 }} state="placing" remaining={12} onDeck={onDeck} />
      </LazyMotion>,
    );
    expect(screen.getByTestId("tiles-left")).toHaveTextContent("12");
    await userEvent.click(screen.getByRole("button", { name: "Tiles left: 12. Show the deck" }));
    expect(onDeck).toHaveBeenCalled();
  });

  it("draws the real tiles from above, in the board's skin, and toggles to the simplified view, remembered on the device (#606)", async () => {
    localStorage.removeItem(DECK_VIEW_KEY);
    deckView.reset();
    const renders = (theme: number, key: string) => (key.endsWith("-top") ? `/r/${key}.${theme}.webp` : null);
    const skins = { cccccfffc: 1 };
    const { unmount } = render(<BoardDeckSheet open onOpenChange={() => {}} tiles={[]} renders={renders} skins={skins} handPlan={null} />);
    const plans = () => screen.getByTestId("deck-plans");
    expect(plans()).toHaveAttribute("data-view", "real");
    const skinned = plans().querySelector('[data-plan="CCCCCFFFC"] img');
    expect(skinned).toHaveAttribute("src", "/r/cccccfffc-top.1.webp");
    expect(plans().querySelector('[data-plan="CCCCCCCCC"] img')).toHaveAttribute("src", "/r/ccccccccc-top.0.webp");
    await userEvent.click(screen.getByRole("radio", { name: /Simplified/ }));
    expect(plans()).toHaveAttribute("data-view", "simple");
    expect(plans().querySelector("img")).toBeNull();
    expect(within(plans()).getAllByRole("img")[0]).toHaveAttribute("data-view", "areas");
    expect(localStorage.getItem(DECK_VIEW_KEY)).toBe("simple");
    unmount();
    // The next sheet opens on the view chosen.
    render(<BoardDeckSheet open onOpenChange={() => {}} tiles={[]} renders={renders} handPlan={null} />);
    expect(plans()).toHaveAttribute("data-view", "simple");
    await userEvent.click(screen.getByRole("radio", { name: /Real/ }));
    expect(plans()).toHaveAttribute("data-view", "real");
  });
});
