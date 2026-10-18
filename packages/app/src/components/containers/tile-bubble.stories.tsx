import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { APP_ASSETS } from "../../mocks/assets";
import { BOARD_38 } from "../../mocks/board";
import { BoardViewport } from "./board-viewport";
import { TileBubble } from "./tile-bubble";

/**
 * The bubble on the tile being handled: Rotate (only when the cell has more than one valid rotation) and Close. Here it
 * stands still (no scene, as in the plan view, above the hand panel); `OnTheBoard` follows a real tile through pan and zoom.
 */
const meta = {
  title: "Containers/TileBubble",
  component: TileBubble,
  args: { rotations: 2, onRotate: fn(), onClose: fn() },
  decorators: [(Story) => <div className="w-full max-w-[375px] p-4"><Story /></div>],
} satisfies Meta<typeof TileBubble>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One valid rotation: only Close. */
export const OneRotation: Story = { args: { rotations: 1 } };
/** Two valid rotations: Rotate swaps between them. */
export const TwoRotations: Story = { args: { rotations: 2 } };
/** Four valid rotations: Rotate goes round. */
export const FourRotations: Story = { args: { rotations: 4 } };

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
        bubble={open ? { cell, rotations: args.rotations, onRotate: args.onRotate, onClose: () => setOpen(false) } : null}
      />
    );
  },
};
