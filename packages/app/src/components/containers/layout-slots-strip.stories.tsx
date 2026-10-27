import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DRAFT_VALID, INVENTORY, LAYOUT_GROWING, LAYOUT_SLOTS } from "../../mocks/village-v2";
import { useLayoutEditor } from "./layout-editor";
import { LayoutSlotsStrip, type LayoutSlotsProps } from "./layout-slots-strip";

/** The strip over an editor open on the growing village (on `DRAFT_VALID` with `changed`), as the editor's panel holds it. */
function InEditor({ changed, ...props }: LayoutSlotsProps & { changed?: boolean }) {
  const kept = props.slots.flatMap((s) => (s.open && s.tiles ? [s.tiles] : []));
  const editor = useLayoutEditor({ village: LAYOUT_GROWING, inventory: INVENTORY, initialEditing: true, initialDraft: changed ? DRAFT_VALID : undefined, kept, randomizer: null });
  return (
    <div className="mx-auto max-w-96 rounded-xl border border-border bg-card/95 p-3">
      <LayoutSlotsStrip editor={editor} {...props} />
    </div>
  );
}

/**
 * The saved layouts' strip (#804): three slots above the inventory in the editor's panel, the active one the village; a slot
 * picked shows its actions (Load, Save here, Make active; Buy on a locked one). One story per state of `LAYOUT_SLOTS`; the home's
 * stories (`Scenes/Home`, `Slots…`) show it in the editor at 375 and 1440 px.
 */
const meta = {
  title: "Containers/LayoutSlotsStrip",
  component: InEditor,
  parameters: { layout: "padded" },
  args: { ...LAYOUT_SLOTS.one, onSaveTo: fn(), onActivate: fn(), onBuy: fn(), onDismissError: fn() },
} satisfies Meta<typeof InEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One slot (the free one, active), the next two locked with their prices. */
export const One: Story = {};
/** Three slots: the village, the die's village, a Wonder village. */
export const Three: Story = { args: LAYOUT_SLOTS.three };
/** A locked slot picked: Buy at its price. */
export const Locked: Story = { args: LAYOUT_SLOTS.locked };
/** Buy asked first: the price and the Cobbles held. */
export const Buy: Story = { args: LAYOUT_SLOTS.buy };
/** The purchase on its way. */
export const Buying: Story = { args: LAYOUT_SLOTS.buying };
/** Slot 2 bought: open and empty, Save here. */
export const Bought: Story = { args: LAYOUT_SLOTS.bought };
/** Too few Cobbles: Buy off, and why. */
export const Short: Story = { args: LAYOUT_SLOTS.short };
/** A saved slot picked: Load, Save here, Make active. */
export const Saved: Story = { args: LAYOUT_SLOTS.saved };
/** Load over changes kept nowhere: asked first. */
export const Load: Story = { args: { ...LAYOUT_SLOTS.load, changed: true } };
/** Make active: asked first. */
export const Activate: Story = { args: LAYOUT_SLOTS.activate };
/** Slot 2 active. */
export const Activated: Story = { args: LAYOUT_SLOTS.activated };
/** A saved layout that needs tiles first (open point 4). */
export const NeedsTiles: Story = { args: LAYOUT_SLOTS.needsTiles };
/** A slot write refused. */
export const Refused: Story = { args: LAYOUT_SLOTS.refused };
