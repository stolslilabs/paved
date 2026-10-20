import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BoardTile } from "@paved/chain";
import { baseDeckPlans, deckSheetCounts, deckSheetOrder, PlanType } from "@paved/game-core";
import BoardDeckSheet, { DeckSheet } from "../src/components/containers/deck-sheet";
import { LazyMotion, domMax } from "motion/react";
import { TileStack } from "../src/components/containers/tile-stack";
import { DECK_VIEW_KEY, deckView } from "../src/data/deck-view";

const id = (plan: PlanType) => Object.values(PlanType).indexOf(plan);

describe("DeckSheet", () => {
  const counts = deckSheetCounts(baseDeckPlans(), [id(PlanType.CCCCCFFFC), id(PlanType.CCCCCFFFC), id(PlanType.CCCCCCCCC)], [id(PlanType.FFFFFFCFF), id(PlanType.FFFFFFCFF)]);

  it("shows 72 chips and crosses out the played ones", () => {
    render(<DeckSheet open onOpenChange={() => {}} deck={{ mode: "counted", counts }} handPlan={id(PlanType.CCCCCFFFC)} side="bottom" />);
    const plans = screen.getByTestId("deck-plans");
    expect(within(plans).getAllByRole("img")).toHaveLength(72);
    expect(plans.querySelectorAll("[data-out='true']")).toHaveLength(5);
    expect(plans.querySelectorAll("[data-discarded='true']")).toHaveLength(2);
    expect(plans.querySelectorAll("[data-state='selected']")).toHaveLength(1);
    expect(screen.getByText(/some never come/)).toBeInTheDocument();
    expect(screen.getByTestId("deck-summary")).toHaveTextContent("3 played, 2 discarded (dashed), 67 not yet.");
  });

  it("shows a Story level's draw in order, each played tile out in its position (#613)", () => {
    const sequence = [PlanType.CFFFCFFFC, PlanType.RFRFFFFFR, PlanType.FFFFFFCFF, PlanType.CFFFCFFFC];
    const order = deckSheetOrder(sequence, [{ discard: false }, { discard: true }]);
    render(<DeckSheet open onOpenChange={() => {}} deck={{ mode: "ordered", order }} side="bottom" />);
    expect(screen.queryByTestId("deck-plans")).toBeNull();
    const slots = [...screen.getByTestId("deck-order").querySelectorAll("li")];
    expect(slots.map((li) => li.getAttribute("data-plan"))).toEqual(sequence);
    expect(slots.map((li) => li.getAttribute("data-slot-state"))).toEqual(["placed", "discarded", "hand", "next"]);
    expect(slots[0]!.querySelector("[data-out='true']")).not.toBeNull();
    expect(slots[1]!.querySelector("[data-discarded='true']")).not.toBeNull();
    expect(slots[2]!.querySelector("[data-state='selected']")).not.toBeNull();
    expect(screen.getByLabelText("Tile 4, to come")).toBeInTheDocument();
    expect(screen.getByText(/in this order, the next one first/)).toBeInTheDocument();
    expect(screen.getByTestId("deck-summary")).toHaveTextContent("1 played, 1 discarded (dashed), 2 not yet.");
  });

  it("never reveals the order of a random draw: the board's sheet without a Story order is the counted base deck (#613)", () => {
    const tiles: BoardTile[] = [PlanType.RFFFRFCFR, PlanType.CCCCCCCCC, PlanType.FFFFCCCFF].map((plan, i) => ({ id: i + 1, plan: id(plan), orientation: 1, x: i, y: 0 }));
    const { rerender } = render(<BoardDeckSheet open onOpenChange={() => {}} tiles={tiles} discardedPlans={[id(PlanType.FFFFFFCFF)]} side="bottom" />);
    const shown = () => [...screen.getByTestId("deck-plans").querySelectorAll("[data-plan]")].map((li) => li.outerHTML);
    expect(screen.queryByTestId("deck-order")).toBeNull();
    expect(screen.getByText(/some never come/)).toBeInTheDocument();
    const before = shown();
    // The same tiles played in another order: the sheet is the same, plan by plan in the plans' order.
    rerender(<BoardDeckSheet open onOpenChange={() => {}} tiles={[...tiles].reverse()} discardedPlans={[id(PlanType.FFFFFFCFF)]} side="bottom" />);
    expect(shown()).toEqual(before);
    const codes = [...screen.getByTestId("deck-plans").querySelectorAll("[data-plan]")].map((li) => id(li.getAttribute("data-plan") as PlanType));
    expect(codes).toEqual([...codes].sort((a, b) => a - b));
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
