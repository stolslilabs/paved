import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DRAFT_VALID, INVENTORY, LAYOUT_GROWING, LAYOUT_SLOTS } from "../../mocks/village-v2";
import { useLayoutEditor } from "./layout-editor";
import { LayoutSlotsStrip, type LayoutSlotsProps } from "./layout-slots-strip";

/** The carousel over an editor open on the growing village (on `DRAFT_VALID` with `changed`), as the editor's panel holds it. */
function InEditor({ changed, ...props }: LayoutSlotsProps & { changed?: boolean }) {
  const kept = props.slots.flatMap((s) => (s.open && s.tiles ? [s.tiles] : []));
  const editor = useLayoutEditor({ village: LAYOUT_GROWING, inventory: INVENTORY, initialEditing: true, initialDraft: changed ? DRAFT_VALID : undefined, kept, randomizer: null });
  // The layout edited, as the stage holds it.
  const first = props.slots.find((s) => s.slot === props.initialSelected && s.open);
  const [picked, setPicked] = useState(first?.slot ?? props.active);
  return (
    <div className="bg-card p-3">
      <LayoutSlotsStrip editor={editor} {...props} picked={picked} onPick={setPicked} />
    </div>
  );
}

/**
 * The saved layouts' carousel (#804; EDIT-VILLAGE, the owner's ask of 2026-11-05): one layout at a time between two arrows, above the
 * inventory; an arrow loads the next (asked first over changes kept nowhere; an empty one keeps the draft), a locked layout shown with its
 * Purchase in its word's place, the arrows going on past it (#1033). One story per state of `LAYOUT_SLOTS`; the home's stories (`Scenes/Home`, `Slots…`,
 * `EditLayouts…`) show it in the editor, Use in its bar, at 320, 375 and 1440 px.
 */
const meta = {
  title: "Containers/LayoutSlotsStrip",
  component: InEditor,
  // The panel's width and padding, as a phone's sheet holds it.
  parameters: { layout: "fullscreen" },
  args: { ...LAYOUT_SLOTS.one, onSaveTo: fn(), onActivate: fn(), onBuy: fn(), onDismissError: fn() },
} satisfies Meta<typeof InEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One slot (the free one, active), the next two locked with their prices. */
export const One: Story = {};
/** Three slots: the village, the die's village, a Wonder village. */
export const Three: Story = { args: LAYOUT_SLOTS.three };
/** A locked layout shown: its Purchase at its price, the arrows going on past it. */
export const Locked: Story = { args: LAYOUT_SLOTS.locked };
/** Buy asked first: the price and the Cobbles held. */
export const Buy: Story = { args: LAYOUT_SLOTS.buy };
/** The purchase on its way. */
export const Buying: Story = { args: LAYOUT_SLOTS.buying };
/** Slot 2 bought: open and empty, Save here. */
export const Bought: Story = { args: LAYOUT_SLOTS.bought };
/** Too few Cobbles: Buy off, and why. */
export const Short: Story = { args: LAYOUT_SLOTS.short };
/** A saved layout shown (layout 2). */
export const Saved: Story = { args: LAYOUT_SLOTS.saved };
/** Load over changes kept nowhere: asked first. */
export const Load: Story = { args: { ...LAYOUT_SLOTS.load, changed: true } };
/** Use: asked first. */
export const Activate: Story = { args: LAYOUT_SLOTS.activate };
/** Slot 2 active. */
export const Activated: Story = { args: LAYOUT_SLOTS.activated };
/** A saved layout that needs tiles first (open point 4). */
export const NeedsTiles: Story = { args: LAYOUT_SLOTS.needsTiles };
/** Layout 3 bought, layout 2 locked (#1033): layout 2 shown, its Purchase, Next going on to layout 3. */
export const Gap: Story = { args: { ...LAYOUT_SLOTS.gap, initialSelected: 1 } };
/** A slot write refused. */
export const Refused: Story = { args: LAYOUT_SLOTS.refused };
