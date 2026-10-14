import type { Meta, StoryObj } from "@storybook/react-vite";
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
