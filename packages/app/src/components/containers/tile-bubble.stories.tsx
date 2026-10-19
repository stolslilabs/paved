import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fireEvent, fn, within } from "storybook/test";
import { APP_ASSETS } from "../../mocks/assets";
import { BOARD_38 } from "../../mocks/board";
import { BoardViewport } from "./board-viewport";
import { TileBubble } from "./tile-bubble";

/**
 * The bubble on the tile being handled (#568): Close, Rotate (only when the cell has more than one valid rotation) and
 * Validate, held about 0.8 s to place the tile, a ring filling around its check. Every button has a hover (desktop), a
 * pressed (touch) and a focus state: white with transparency. Here it stands still (no scene, as in the plan view, above
 * the hand panel); `OnTheBoard` follows a real tile through pan and zoom.
 */
const meta = {
  title: "Containers/TileBubble",
  component: TileBubble,
  args: { rotations: 2, onRotate: fn(), onClose: fn(), onConfirm: fn(), canConfirm: true, holdMs: 800 },
  argTypes: { holdMs: { control: { type: "range", min: 200, max: 3000, step: 50 }, description: "Validate's hold, ms (800 in the game)" } },
  decorators: [(Story) => <div className="w-full max-w-[375px] p-4"><Story /></div>],
} satisfies Meta<typeof TileBubble>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One valid rotation: Close and Validate. */
export const OneRotation: Story = { args: { rotations: 1 } };
/** Two valid rotations: Rotate swaps between them. */
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
/** The move is on its way: Validate spins and is disabled. */
export const Busy: Story = { args: { busy: true } };
/** The tile cannot be placed yet (its points not known): Validate is disabled. */
export const Disabled: Story = { args: { canConfirm: false } };
/** A Story level's coach mark on the placement: Validate is ringed. */
export const Coached: Story = { args: { coach: true } };
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
        bubble={open ? { cell, rotations: args.rotations, onRotate: args.onRotate, onClose: () => setOpen(false), onConfirm: args.onConfirm, canConfirm: true } : null}
      />
    );
  },
};
