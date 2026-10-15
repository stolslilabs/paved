import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BOARD_38, BOARD_72 } from "../../mocks/board";
import { BoardMap } from "./board-map";

const meta = {
  title: "Containers/BoardMap",
  component: BoardMap,
  args: { tiles: BOARD_38.tiles },
  decorators: [(Story) => <div className="relative h-[32rem]"><Story /></div>],
} satisfies Meta<typeof BoardMap>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The bench's 38-tile board from above. */
export const Board38: Story = {};
export const Board72: Story = { args: { tiles: BOARD_72.tiles } };
/** A move sent: its tile pulses until the receipt. */
export const PendingTile: Story = { args: { tiles: [...BOARD_38.tiles, { ...BOARD_38.next, pending: true }] } };
/** Playable (P3): the recorded next tile's slot lit as a button, chosen, with the tile in hand drawn on it. */
export const Slots: Story = {
  args: {
    slots: [{ x: BOARD_38.next.x, y: BOARD_38.next.y }],
    ghost: { x: BOARD_38.next.x, y: BOARD_38.next.y, plan: BOARD_38.next.plan, orientation: BOARD_38.next.orientation },
    onSlotClick: fn(),
  },
};
