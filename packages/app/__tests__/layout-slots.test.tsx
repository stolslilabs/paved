/**
 * The saved layouts in the editor (#804; EDIT-VILLAGE, the owner's asks of 2026-11-05): a carousel of one above the inventory, its
 * arrows loading a layout into the editor (Save's target), a locked layout a step of its own with its Purchase (#1033); Use in the bar
 * (#804's Make active), Save on its floppy disc; nothing lost unasked.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { slow } from "../test-slow";
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
/** The stage rendered, its panel in (its own chunk, EDIT-VILLAGE). */
const mount = async (ui: ReturnType<typeof stage>) => {
  const view = render(ui);
  await screen.findByRole("complementary", { name: "Editor" }, { timeout: slow(5000) });
  return view;
};
/** The carousel. */
const carousel = () => within(screen.getByRole("group", { name: "Layouts" }));
/** The layout shown (edited). */
const shown = (n: number) => waitFor(() => expect(carousel().getByText(`Layout ${n}`)).toBeInTheDocument());
const arrow = (way: "Previous" | "Next") => carousel().getByRole("button", { name: `${way} layout` });
const purchase = (n: number, price: number) => carousel().getByRole("button", { name: `Purchase layout ${n} for ${formatInteger(price)} Cobbles` });
/** One of the layouts' questions. */
const question = () => screen.queryByRole("dialog");
/** The live score at the top left: the panel's view of the draft follows a render behind (`useDeferredValue`). */
const scoreShown = (n: number) => screen.findByRole("img", { name: new RegExp(`^Score ${formatInteger(n)}(,|$)`) });
const save = () => screen.getByRole("button", { name: /^Save$/ });
/** Start on the active layout, not a story's pick. */
const unpicked = (slots: LayoutSlotsProps): LayoutSlotsProps => ({ ...slots, initialSelected: undefined });

describe("the saved layouts' carousel (#804, EDIT-VILLAGE)", () => {
  it("shows the active layout above the inventory, the previous arrow off, Next on to the locked layout, Active in the bar", async () => {
    await mount(stage(LAYOUT_SLOTS.one));
    const panel = screen.getByRole("complementary", { name: "Editor" });
    expect(within(panel).getByRole("group", { name: "Layouts" })).toBeInTheDocument();
    expect(within(panel).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Layouts", "Inventory"]);
    await shown(1);
    expect(carousel().getByText("Active")).toBeInTheDocument();
    expect(arrow("Previous")).toBeDisabled();
    expect(arrow("Next")).toBeEnabled();
    expect(carousel().queryByRole("button", { name: /^Purchase/ })).toBeNull();
    // The bar: Save on its disc; the layout the village's: Use pressed in and off ("Active" is the carousel's alone).
    const bar = screen.getByRole("button", { name: "Leave edit mode" }).closest("header")!;
    expect(within(bar).getByRole("button", { name: /^Save$/ })).toBeInTheDocument();
    const use = within(bar).getByRole("button", { name: "Use" });
    expect(use).toHaveAttribute("aria-pressed", "true");
    expect(use).toBeDisabled();
    expect(within(bar).queryByText("Active")).toBeNull();
    expect(screen.getByText(/The village attackers face/)).toBeInTheDocument();
  });

  it("unlocks the next layout after asking, at its price; bought, the carousel moves on to it, the draft kept", async () => {
    const onBuy = vi.fn();
    const onSaveTo = vi.fn();
    const props = { ...unpicked(LAYOUT_SLOTS.one), onBuy, onSaveTo };
    const { rerender } = await mount(stage(props, { initialDraft: DRAFT_VALID }));
    // Layout 2 shown, locked: its Purchase in its word's place, the draft and Save's layout unchanged.
    fireEvent.click(arrow("Next"));
    expect(question()).toBeNull();
    await shown(2);
    expect(screen.getByText("Locked: unlock it to keep another layout. Save keeps your changes in layout 1.")).toBeInTheDocument();
    await scoreShown(layoutScore(DRAFT_VALID));
    fireEvent.click(purchase(2, 100));
    const dialog = screen.getByRole("dialog", { name: "Unlock layout 2?" });
    expect(onBuy).not.toHaveBeenCalled();
    // In the HUD's look: one answer, the price as the Shop writes it; the drawers' red close is the cancel (no Cancel beside it); the
    // Cobbles held under the price, the icon and the figure on one line.
    const unlock = within(dialog).getByRole("button", { name: "Unlock layout 2 for 100 Cobbles" });
    expect(unlock).toHaveTextContent(/^100$/);
    expect(within(dialog).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Cancel", "Unlock layout 2 for 100 Cobbles"]);
    expect(within(dialog).getByRole("img", { name: "640 Cobbles" }).parentElement).toHaveClass("flex", "items-center");
    fireEvent.click(unlock);
    expect(onBuy).toHaveBeenCalledWith(1, 100);
    // On its way: the carousel waits.
    rerender(stage({ ...props, busy: { kind: "buy", slot: 1 } }, { initialDraft: DRAFT_VALID }));
    await shown(2);
    // (the question's exit over: the page is reachable again)
    await waitFor(() => expect(purchase(2, 100)).toBeDisabled());
    // Bought: layout 2 open and empty, shown, the draft kept; Save keeps it there.
    rerender(stage({ ...props, slots: LAYOUT_SLOTS.bought.slots, cobbles: LAYOUT_SLOTS.bought.cobbles }, { initialDraft: DRAFT_VALID }));
    await shown(2);
    expect(carousel().getByText("Empty")).toBeInTheDocument();
    await scoreShown(layoutScore(DRAFT_VALID));
    fireEvent.click(save());
    expect(onSaveTo).toHaveBeenCalledWith(1, DRAFT_VALID);
  });

  it("does not offer a layout the player cannot pay for", async () => {
    // Layout 3 (250 Cobbles, 40 held): its question has Unlock off and says why.
    await mount(stage({ ...LAYOUT_SLOTS.short, slots: LAYOUT_SLOTS.bought.slots, initialSelected: 1, initialAsk: null }));
    await shown(2);
    fireEvent.click(arrow("Next"));
    await shown(3);
    expect(screen.getByText(/^Not enough Cobbles yet\./)).toBeInTheDocument();
    fireEvent.click(purchase(3, 250));
    const dialog = screen.getByRole("dialog", { name: "Unlock layout 3?" });
    expect(within(dialog).getByRole("button", { name: "Unlock layout 3 for 250 Cobbles" })).toBeDisabled();
    expect(within(dialog).getByText("Not enough Cobbles yet.")).toBeInTheDocument();
  });

  it("saves the die's village into another layout through Save, and then leaving does not ask: it is kept", async () => {
    const tiles = randomLayout(stockOf(INVENTORY, LAYOUT_GROWING.tiles), 28, 1, STILL).tiles;
    const randomizer = { run: async () => ({ tiles }), cancel: () => {}, dispose: () => {} };
    const onSaveTo = vi.fn();
    const onSave = vi.fn();
    const onEditingChange = vi.fn();
    const slots = unpicked(LAYOUT_SLOTS.bought);
    const { rerender } = await mount(stage({ ...slots, onSaveTo }, { randomizer, onEditingChange, onSave }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Random village from your tiles" })));
    // To the empty layout 2: nothing asked, the die's village kept; Save keeps it there.
    fireEvent.click(arrow("Next"));
    expect(question()).toBeNull();
    await shown(2);
    fireEvent.click(save());
    expect(onSave).not.toHaveBeenCalled();
    expect(onSaveTo).toHaveBeenCalledTimes(1);
    expect(onSaveTo.mock.calls[0]![0]).toBe(1);
    const saved = onSaveTo.mock.calls[0]![1];
    expect(saved).toHaveLength(28);
    // Kept nowhere yet: Back asks
    fireEvent.click(screen.getByRole("button", { name: "Leave edit mode" }));
    expect(screen.getByRole("dialog", { name: "Leave without saving?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(question()).toBeNull());
    // The save landed: layout 2 keeps it, the village unchanged; Save has nothing new to keep, Back leaves at once
    const after = slots.slots.map((s) => (s.slot === 1 ? { ...s, tiles: saved, score: layoutScore(saved) } : s));
    rerender(stage({ ...slots, slots: after, onSaveTo }, { randomizer, onEditingChange, onSave }));
    expect(save()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Leave edit mode" }));
    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).toBeNull();
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });

  it("goes past a locked layout 2 to an owned layout 3, and buys either independently (ownership [0, 2], #1033)", async () => {
    const onBuy = vi.fn();
    const wonder = LAYOUT_SLOTS.gap.slots[2]!.tiles!;
    await mount(stage({ ...unpicked(LAYOUT_SLOTS.gap), onBuy }));
    await shown(1);
    // On to layout 2, locked: shown with its Purchase, nothing loaded, Use still layout 1's.
    fireEvent.click(arrow("Next"));
    expect(question()).toBeNull();
    await shown(2);
    expect(purchase(2, 100)).toBeEnabled();
    expect(screen.getByRole("button", { name: "Use" })).toHaveAttribute("aria-pressed", "true");
    // Its purchase asked, then cancelled: still on layout 2, the arrows on both ways.
    fireEvent.click(purchase(2, 100));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Unlock layout 2?" })).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(question()).toBeNull());
    expect(onBuy).not.toHaveBeenCalled();
    await shown(2);
    expect(arrow("Previous")).toBeEnabled();
    // Past it to layout 3, owned: loaded at once (the draft is the village's, kept in layout 1), Use on it.
    fireEvent.click(arrow("Next"));
    expect(question()).toBeNull();
    await shown(3);
    await scoreShown(layoutScore(wonder));
    expect(arrow("Next")).toBeDisabled();
    expect(carousel().queryByRole("button", { name: /^Purchase/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Use" })).toBeEnabled();
    // Back through layout 2 (its Purchase again, layout 3 still edited) to layout 1.
    fireEvent.click(arrow("Previous"));
    await shown(2);
    expect(screen.getByText("Locked: unlock it to keep another layout. Save keeps your changes in layout 3.")).toBeInTheDocument();
    fireEvent.click(purchase(2, 100));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Unlock layout 2?" })).getByRole("button", { name: "Unlock layout 2 for 100 Cobbles" }));
    expect(onBuy).toHaveBeenCalledWith(1, 100);
    await waitFor(() => expect(question()).toBeNull());
    fireEvent.click(arrow("Previous"));
    await shown(1);
    await scoreShown(layoutScore(LAYOUT_GROWING.tiles));
  });

  it("buys layout 3 first, past a locked layout 2 (ownership [0])", async () => {
    const onBuy = vi.fn();
    await mount(stage({ ...unpicked(LAYOUT_SLOTS.one), onBuy }));
    fireEvent.click(arrow("Next"));
    await shown(2);
    fireEvent.click(arrow("Next"));
    await shown(3);
    fireEvent.click(purchase(3, 250));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Unlock layout 3?" })).getByRole("button", { name: "Unlock layout 3 for 250 Cobbles" }));
    expect(onBuy).toHaveBeenCalledWith(2, 250);
  });

  it("loads the next saved layout, asking first over changes kept nowhere", async () => {
    await mount(stage(unpicked(LAYOUT_SLOTS.saved), { initialDraft: DRAFT_VALID }));
    const target = LAYOUT_SLOTS.saved.slots[1]!.tiles!;
    await scoreShown(layoutScore(DRAFT_VALID));
    fireEvent.click(arrow("Next"));
    const dialog = screen.getByRole("dialog", { name: "Load layout 2?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    await scoreShown(layoutScore(DRAFT_VALID));
    await shown(1);
    fireEvent.click(arrow("Next"));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Load layout 2?" })).getByRole("button", { name: "Load" }));
    await scoreShown(layoutScore(target));
    await shown(2);
  });

  it("loads at once when the draft is a saved layout's, both ways", async () => {
    await mount(stage(unpicked(LAYOUT_SLOTS.saved)));
    fireEvent.click(arrow("Next"));
    expect(question()).toBeNull();
    await scoreShown(layoutScore(LAYOUT_SLOTS.saved.slots[1]!.tiles!));
    await shown(2);
    fireEvent.click(arrow("Previous"));
    expect(question()).toBeNull();
    await scoreShown(layoutScore(LAYOUT_GROWING.tiles));
    await shown(1);
  });

  it("uses the layout shown after asking: attackers will face it", async () => {
    const onActivate = vi.fn();
    await mount(stage(unpicked({ ...LAYOUT_SLOTS.saved, onActivate })));
    fireEvent.click(arrow("Next"));
    await shown(2);
    expect(screen.getByRole("button", { name: "Use" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Use" }));
    const dialog = screen.getByRole("dialog", { name: "Use layout 2?" });
    expect(within(dialog).getByText(/Attackers will face this layout/)).toBeInTheDocument();
    expect(onActivate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Use" }));
    expect(onActivate).toHaveBeenCalledWith(1);
  });

  it("waits for a save before Use: it takes the saved layout", async () => {
    await mount(stage(LAYOUT_SLOTS.saved, { initialDraft: DRAFT_VALID }));
    await shown(2);
    expect(screen.getByRole("button", { name: "Use" })).toBeDisabled();
    expect(screen.getByText("Save first: Use takes the saved layout.")).toBeInTheDocument();
  });

  it("never uses a layout that needs tiles the player no longer holds", async () => {
    await mount(stage(LAYOUT_SLOTS.needsTiles));
    await shown(3);
    expect(screen.getByRole("button", { name: "Use" })).toBeDisabled();
    expect(screen.getByText(/Needs tiles you no longer hold/)).toBeInTheDocument();
  });

  it("says a refused slot write above the carousel, and waits while a write is on its way", async () => {
    await mount(stage(LAYOUT_SLOTS.refused));
    expect(screen.getByText("The price changed: check it and buy again.")).toBeInTheDocument();
    cleanup();
    await mount(stage(LAYOUT_SLOTS.buying));
    expect(purchase(2, 100)).toBeDisabled();
    expect(arrow("Previous")).toBeDisabled();
    expect(arrow("Next")).toBeDisabled();
  });

  it("saves into the slot shown active, and waits while a slot write is on its way (no Save racing an activation)", async () => {
    const onSave = vi.fn();
    const slots = unpicked(LAYOUT_SLOTS.saved);
    const { rerender } = await mount(stage({ ...slots, busy: { kind: "activate", slot: 1 } }, { initialDraft: DRAFT_VALID, onSave }));
    expect(save()).toBeDisabled();
    fireEvent.click(save());
    expect(onSave).not.toHaveBeenCalled();
    // The activation answered (refused here: slot 1 still active): Save goes to slot 1, by its index
    rerender(stage({ ...slots, busy: null }, { initialDraft: DRAFT_VALID, onSave }));
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![2]).toBe(0);
  });

  it("keeps Use in its place, off, where the slots are not served (no carousel): the bar's buttons never move", async () => {
    await mount(
      <LazyMotion features={domMax}>
        <VillageStage village={LAYOUT_GROWING} inventory={INVENTORY} editable editing randomizer={null} initialDraft={DRAFT_VALID} />
      </LazyMotion>,
    );
    expect(save()).toBeEnabled();
    expect(screen.queryByRole("group", { name: "Layouts" })).toBeNull();
    const use = screen.getByRole("button", { name: "Use" });
    expect(use).toBeDisabled();
    expect(use).toHaveAttribute("aria-pressed", "false");
    // Last in the bar, after Save, as with the layouts.
    expect(save().compareDocumentPosition(use) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
