/** The saved layouts' strip in the editor (#804): three slots, Load, Save here, Make active, Buy, and nothing lost unasked. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatInteger, randomLayout } from "@paved/game-core";
import { layoutScore, stockOf } from "../src/components/containers/layout-rules";
import type { LayoutSlotsProps } from "../src/components/containers/layout-slots-strip";
import VillageStage from "../src/components/containers/village-stage";
import { STILL } from "../src/mocks/random-layout";
import { DRAFT_VALID, INVENTORY, LAYOUT_GROWING, LAYOUT_SLOTS } from "../src/mocks/village-v2";

afterEach(cleanup);

const stage = (layoutSlots: LayoutSlotsProps, props: Partial<ComponentProps<typeof VillageStage>> = {}) => (
  <LazyMotion features={domMax}>
    <VillageStage village={LAYOUT_GROWING} inventory={INVENTORY} editable editing randomizer={null} layoutSlots={layoutSlots} {...props} />
  </LazyMotion>
);
const card = (name: RegExp) => within(screen.getByRole("group", { name: "Layout slots" })).getByRole("button", { name });
/** The bar's live score: the panel's view of the draft follows a render behind (`useDeferredValue`). */
const scoreShown = (n: number) => screen.findByRole("button", { name: `Score ${formatInteger(n)}: show the points` });

describe("the saved layouts' strip (#804)", () => {
  it("shows the three slots above the inventory: the active one's score, the locked ones' prices", () => {
    render(stage(LAYOUT_SLOTS.one));
    expect(card(/^Slot 1, active: score/)).toHaveAttribute("aria-pressed", "true");
    expect(card(/^Slot 2, locked: 100 Cobbles/)).toBeTruthy();
    expect(card(/^Slot 3, locked: 250 Cobbles/)).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    // The active slot: Load only (its layout is the draft), Save is the panel's
    expect(screen.getByRole("button", { name: /Load/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Save here/ })).toBeNull();
  });

  it("buys a locked slot after asking, at its price", () => {
    const onBuy = vi.fn();
    render(stage({ ...LAYOUT_SLOTS.one, onBuy }));
    fireEvent.click(card(/^Slot 2/));
    fireEvent.click(screen.getByRole("button", { name: /Buy slot 2/ }));
    const dialog = screen.getByRole("dialog", { name: "Buy slot 2?" });
    expect(onBuy).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Buy" }));
    expect(onBuy).toHaveBeenCalledWith(1, 100);
  });

  it("does not offer a slot the player cannot pay for", () => {
    render(stage(LAYOUT_SLOTS.short));
    expect(screen.getByRole("button", { name: /Buy slot 3/ })).toBeDisabled();
    expect(screen.getByText("Not enough Cobbles yet.")).toBeTruthy();
  });

  it("saves the die's village into another slot, and then leaving does not ask: it is kept", async () => {
    const tiles = randomLayout(stockOf(INVENTORY, LAYOUT_GROWING.tiles), 28, 1, STILL).tiles;
    const randomizer = { run: async () => ({ tiles }), cancel: () => {}, dispose: () => {} };
    const onSaveTo = vi.fn();
    const onEditingChange = vi.fn();
    const { rerender } = render(stage({ ...LAYOUT_SLOTS.bought, onSaveTo }, { randomizer, onEditingChange }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Random village from your tiles" })));
    fireEvent.click(screen.getByRole("button", { name: /Save here/ }));
    expect(onSaveTo).toHaveBeenCalledTimes(1);
    expect(onSaveTo.mock.calls[0]![0]).toBe(1);
    const saved = onSaveTo.mock.calls[0]![1];
    expect(saved).toHaveLength(28);
    // Kept nowhere yet: Back asks
    fireEvent.click(screen.getByRole("button", { name: "Leave edit mode" }));
    expect(screen.getByRole("dialog", { name: "Leave without saving?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The save landed: slot 2 keeps it, the village unchanged; Back leaves at once
    const slots = LAYOUT_SLOTS.bought.slots.map((s) => (s.slot === 1 ? { ...s, tiles: saved, score: layoutScore(saved) } : s));
    rerender(stage({ ...LAYOUT_SLOTS.bought, slots, onSaveTo }, { randomizer, onEditingChange }));
    expect(screen.getByRole("button", { name: /Save here/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Leave edit mode" }));
    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).toBeNull();
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });

  it("loads a slot into the draft, asking first over changes kept nowhere", async () => {
    render(stage(LAYOUT_SLOTS.saved, { initialDraft: DRAFT_VALID }));
    const target = LAYOUT_SLOTS.saved.slots[1]!.tiles!;
    await scoreShown(layoutScore(DRAFT_VALID));
    fireEvent.click(screen.getByRole("button", { name: /Load/ }));
    const dialog = screen.getByRole("dialog", { name: "Load slot 2?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    await scoreShown(layoutScore(DRAFT_VALID));
    fireEvent.click(screen.getByRole("button", { name: /Load/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Load slot 2?" })).getByRole("button", { name: "Load" }));
    await scoreShown(layoutScore(target));
    expect(screen.getByRole("button", { name: /Load/ })).toBeDisabled();
  });

  it("loads at once when the draft is the village's", async () => {
    render(stage(LAYOUT_SLOTS.saved));
    fireEvent.click(screen.getByRole("button", { name: /Load/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await scoreShown(layoutScore(LAYOUT_SLOTS.saved.slots[1]!.tiles!));
  });

  it("makes a slot active after asking: attackers will face it", () => {
    const onActivate = vi.fn();
    render(stage({ ...LAYOUT_SLOTS.saved, onActivate }));
    fireEvent.click(screen.getByRole("button", { name: /Make active/ }));
    const dialog = screen.getByRole("dialog", { name: "Make slot 2 active?" });
    expect(within(dialog).getByText(/Attackers will face this layout/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Make active" }));
    expect(onActivate).toHaveBeenCalledWith(1);
  });

  it("never makes active a layout that needs tiles the player no longer holds", () => {
    render(stage(LAYOUT_SLOTS.needsTiles));
    expect(screen.getByRole("button", { name: /Make active/ })).toBeDisabled();
    expect(screen.getByText(/Needs tiles you no longer hold/)).toBeTruthy();
  });

  it("says a refused slot write above the slots, and waits while a write is on its way", () => {
    render(stage(LAYOUT_SLOTS.refused));
    expect(screen.getByText("The price changed: check it and buy again.")).toBeTruthy();
    cleanup();
    render(stage(LAYOUT_SLOTS.buying));
    expect(screen.getByRole("button", { name: /Buy slot 2/ })).toBeDisabled();
  });

  it("shows no strip where the slots are not served", () => {
    render(
      <LazyMotion features={domMax}>
        <VillageStage village={LAYOUT_GROWING} inventory={INVENTORY} editable editing randomizer={null} />
      </LazyMotion>,
    );
    expect(screen.queryByRole("group", { name: "Layout slots" })).toBeNull();
  });
});

it("draws each slot's small plan, a square per tile", () => {
  const { container } = render(stage(LAYOUT_SLOTS.three));
  const plans = container.querySelectorAll('[aria-label="Layout slots"] svg');
  expect(plans).toHaveLength(3);
  expect(plans[0]!.querySelectorAll("rect")).toHaveLength(LAYOUT_GROWING.tiles.length);
});
