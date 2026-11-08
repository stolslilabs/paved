import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BoardTile } from "@paved/chain";
import { baseDeckPlans, deckSheetCounts, deckSheetOrder, PlanType } from "@paved/game-core";
import BoardDeckSheet, { DeckSheet } from "../src/components/containers/deck-sheet";
import { LazyMotion, domMax } from "motion/react";
import { TileStack } from "../src/components/containers/tile-stack";
import { DECK_VIEW_KEY, deckView } from "../src/data/deck-view";
import { attackDeckSheet } from "../src/lib/attack-deck-sheet";

const id = (plan: PlanType) => Object.values(PlanType).indexOf(plan);

describe("DeckSheet", () => {
  const counts = deckSheetCounts(baseDeckPlans(), [id(PlanType.CCCCCFFFC), id(PlanType.CCCCCFFFC), id(PlanType.CCCCCCCCC)], [id(PlanType.FFFFFFCFF), id(PlanType.FFFFFFCFF)]);

  /** A grid's figures, summed over its plans: the tiles left, played and discarded. */
  const sum = (list: HTMLElement, key: "left" | "played" | "discarded") => [...list.querySelectorAll("li")].reduce((n, li) => n + Number(li.getAttribute(`data-${key}`)), 0);

  it("shows the 72 tiles as their plans, each with the tiles left of it, the plan in hand marked (ATTACK-SCOUT)", () => {
    render(<DeckSheet open onOpenChange={() => {}} deck={{ mode: "counted", counts }} handPlan={id(PlanType.CCCCCFFFC)} />);
    const plans = screen.getByTestId("deck-plans");
    expect(plans.querySelectorAll("li")).toHaveLength(counts.plans.length);
    expect(sum(plans, "left") + sum(plans, "played") + sum(plans, "discarded")).toBe(72);
    expect(sum(plans, "played")).toBe(3);
    expect(sum(plans, "discarded")).toBe(2);
    expect(plans.querySelectorAll("[data-hand]")).toHaveLength(1);
    expect(plans.querySelector('[data-plan="CCCCCFFFC"]')).toHaveAttribute("data-hand", "true");
    expect(screen.getByLabelText(/^Capital: 0 of 1 left, 1 played$/)).toBeInTheDocument();
    // The title is the fixed word (TILE-COUNTS): the 72 read in the band at the top.
    expect(screen.getByRole("heading", { name: "Tiles" })).toBeInTheDocument();
    expect(screen.getByText(/some never come/)).toBeInTheDocument();
    expect(screen.getByTestId("deck-summary")).toHaveTextContent("Left67Played3Discarded2");
  });

  it("shows a Story level's draw in order, each played tile out in its position (#613)", () => {
    const sequence = [PlanType.CFFFCFFFC, PlanType.RFRFFFFFR, PlanType.FFFFFFCFF, PlanType.CFFFCFFFC];
    const order = deckSheetOrder(sequence, [{ discard: false }, { discard: true }]);
    render(<DeckSheet open onOpenChange={() => {}} deck={{ mode: "ordered", order }} />);
    expect(screen.queryByTestId("deck-plans")).toBeNull();
    const slots = [...screen.getByTestId("deck-order").querySelectorAll("li")];
    expect(slots.map((li) => li.getAttribute("data-plan"))).toEqual(sequence);
    expect(slots.map((li) => li.getAttribute("data-slot-state"))).toEqual(["placed", "discarded", "hand", "next"]);
    expect(slots[0]!.querySelector("[data-out]")).not.toBeNull();
    expect(slots[1]!.querySelector("[data-out]")).not.toBeNull();
    expect(slots[2]!.querySelector("[data-out]")).toBeNull();
    expect(slots[2]).toHaveTextContent("Now");
    expect(screen.getByLabelText("Tile 4, to come")).toBeInTheDocument();
    expect(screen.getByText(/in this order, the next one first/)).toBeInTheDocument();
    expect(screen.getByTestId("deck-summary")).toHaveTextContent("Left2Played1Discarded1");
  });

  it("never reveals the order of a random draw: the board's sheet without a Story order is the counted base deck (#613)", () => {
    const tiles: BoardTile[] = [PlanType.RFFFRFCFR, PlanType.CCCCCCCCC, PlanType.FFFFCCCFF].map((plan, i) => ({ id: i + 1, plan: id(plan), orientation: 1, x: i, y: 0 }));
    const { rerender } = render(<BoardDeckSheet open onOpenChange={() => {}} tiles={tiles} discardedPlans={[id(PlanType.FFFFFFCFF)]} />);
    const shown = () => [...screen.getByTestId("deck-plans").querySelectorAll("[data-plan]")].map((li) => li.outerHTML);
    expect(screen.queryByTestId("deck-order")).toBeNull();
    expect(screen.getByText(/some never come/)).toBeInTheDocument();
    const before = shown();
    // The same tiles played in another order: the sheet is the same, plan by plan in the plans' order.
    rerender(<BoardDeckSheet open onOpenChange={() => {}} tiles={[...tiles].reverse()} discardedPlans={[id(PlanType.FFFFFFCFF)]} />);
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

  it.each([
    { name: "[hand, next, left]", view: ["A", "A", "B"] as const, next: 1 },
    { name: "[hand, next, next]", view: ["A", "A", "A"] as const, next: 2 },
    { name: "[hand, left, left]", view: ["A", "B", "B"] as const, next: 0 },
  ])("tells the copies coming next of the plan in hand apart: $name (#1058)", ({ view, next }) => {
    const plans = { A: id(PlanType.CCCCCFFFC), B: id(PlanType.FFFFCCCFF) };
    const attack = attackDeckSheet({ defenderPlans: [plans.A, plans.A, plans.A, plans.B, plans.B, plans.B], size: 6, moves: [], view: view.map((k) => plans[k]) });
    render(<DeckSheet open onOpenChange={() => {}} deck={{ mode: "attack", attack }} />);
    const cell = screen.getByTestId("deck-plans").querySelector('[data-plan="CCCCCFFFC"]')!;
    expect(cell).toHaveAttribute("data-hand", "true");
    expect(cell).toHaveAttribute("data-left", "3");
    const badge = cell.querySelector('[data-slot="deck-next"]');
    if (next === 0) {
      expect(cell).not.toHaveAttribute("data-next");
      expect(badge).toBeNull();
      expect(cell.getAttribute("aria-label")).not.toMatch(/coming next/);
    } else {
      expect(cell).toHaveAttribute("data-next", String(next));
      expect(badge).toHaveTextContent(String(next));
      expect(cell.getAttribute("aria-label")).toMatch(new RegExp(`in hand, ${next} coming next$`));
    }
  });

  it("gives both view toggles the 44 px touch floor, the painted icon unchanged (#1058)", () => {
    render(<DeckSheet open onOpenChange={() => {}} deck={{ mode: "counted", counts }} onViewChange={() => {}} />);
    for (const name of ["Real", "Simplified"]) {
      const toggle = screen.getByRole("radio", { name });
      // Tailwind's `size-N` is N x 4 CSS px (jsdom lays nothing out, so the class is the measure).
      const size = Number(/(?:^|\s)size-(\d+)(?:\s|$)/.exec(toggle.className)?.[1]);
      expect(size * 4, `${name} toggle in CSS px`).toBeGreaterThanOrEqual(44);
      expect(toggle.querySelector(".size-7")).not.toBeNull();
    }
  });
});
