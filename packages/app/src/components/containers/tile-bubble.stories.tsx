import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fireEvent, fn, within } from "storybook/test";
import { APP_ASSETS } from "../../mocks/assets";
import { BOARD_38 } from "../../mocks/board";
import { BoardViewport } from "./board-viewport";
import { TileBubble } from "./tile-bubble";

/**
 * The bubble on the tile being handled (#568, #606): Cancel, Discard (held, a grey circle whose ring fills red), Rotate
 * (only when the cell has more than one valid rotation) and Validate, held about 0.8 s to place the tile, a grey ring filling
 * around its check on the yellow button. Every button has a hover (desktop), a pressed (touch) and a focus state: white with
 * transparency. Here it stands still (no scene, as in the plan view, above the tile stack); `OnTheBoard` follows a real
 * tile through pan and zoom.
 */
const meta = {
  title: "Containers/TileBubble",
  component: TileBubble,
  args: { rotations: 2, onRotate: fn(), onClose: fn(), onDiscard: fn(), discardCost: 50, onConfirm: fn(), canConfirm: true, holdMs: 800 },
  argTypes: { holdMs: { control: { type: "range", min: 200, max: 3000, step: 50 }, description: "Validate's hold, ms (800 in the game)" } },
  decorators: [(Story) => <div className="w-full max-w-[375px] p-4"><Story /></div>],
} satisfies Meta<typeof TileBubble>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One valid rotation: Cancel, Discard and Validate. */
export const OneRotation: Story = { args: { rotations: 1 } };
/** Two valid rotations: the four buttons, Cancel, Discard, Rotate and Validate (196 px: it fits a 375 px board). */
export const TwoRotations: Story = { args: { rotations: 2 } };
/** Four valid rotations: Rotate goes round. */
export const FourRotations: Story = { args: { rotations: 4 } };
/** Validate held: the ring fills around the check (a 6 s hold here, so it can be looked at). */
export const Holding: Story = {
  args: { holdMs: 6000 },
  play: async ({ canvasElement }) => {
    fireEvent.pointerDown(within(canvasElement).getByRole("button", { name: "Hold to place the tile" }), { button: 0 });
  },
};
/** Discard held: the red ring fills around the trash in its grey circle (a 6 s hold here, so it can be looked at). */
export const DiscardHolding: Story = {
  args: { holdMs: 6000 },
  play: async ({ canvasElement }) => {
    fireEvent.pointerDown(within(canvasElement).getByRole("button", { name: /^Hold to discard the tile/ }), { button: 0 });
  },
};
/** At 0 points a discard is free: its label says so. */
export const FreeDiscard: Story = { args: { discardCost: 0 } };
/** The village editor's bubble on a tile from the inventory (#756): Back to the inventory and Rotate, no Cancel (Escape cancels) and no Validate. */
export const Editor: Story = { args: { onDiscard: undefined, onConfirm: undefined, onReturn: fn(), cancelButton: false } };
/** The village editor's bubble on a lifted tile: Cancel puts it back where it was. */
export const EditorLifted: Story = { args: { onDiscard: undefined, onConfirm: undefined, onReturn: fn() } };
/** The move is on its way: Validate spins and is disabled. */
export const Busy: Story = { args: { busy: true } };
/** The tile cannot be placed yet (its points not known): Validate is disabled. */
export const Disabled: Story = { args: { canConfirm: false } };
/** A Story level's coach mark on the placement: Validate is ringed. */
export const Coached: Story = { args: { coach: "place" } };
/** A Story level's coach mark on the discard, the tile on a cell: the bubble's trash is ringed. */
export const CoachedDiscard: Story = { args: { coach: "discard" } };
/** Keyboard focus on Validate: the focus ring (Tab to it; Enter or Space held places). */
export const Focused: Story = {
  play: async ({ canvasElement }) => {
    within(canvasElement).getByRole("button", { name: "Hold to place the tile" }).focus();
  },
};

/** On the board at 375 px: the bubble stands on the top-right corner of the cell, and follows it when the board is panned or zoomed. */
export const OnTheBoard: Story = {
  decorators: [(Story) => <div className="relative h-[812px] w-full max-w-[375px]"><Story /></div>],
  render: function Render(args) {
    const [open, setOpen] = useState(true);
    const cell = { x: BOARD_38.next.x, y: BOARD_38.next.y };
    return (
      <BoardViewport
        tiles={BOARD_38.tiles}
        basePath={APP_ASSETS}
        ghost={open ? { ...cell, plan: BOARD_38.next.plan, orientation: BOARD_38.next.orientation, placed: true, fits: true } : null}
        bubble={open ? { cell, rotations: args.rotations, onRotate: args.onRotate, onClose: () => setOpen(false), onDiscard: args.onDiscard, discardCost: args.discardCost, onConfirm: args.onConfirm, canConfirm: true } : null}
      />
    );
  },
};
