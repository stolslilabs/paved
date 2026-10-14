import type { Meta, StoryObj } from "@storybook/react-vite";
import { RENDERER_ASSETS } from "../../mocks/assets";
import { BOARD_38, BOARD_72 } from "../../mocks/board";
import { BoardViewport } from "./board-viewport";

/** The real renderer (`@paved/renderer`'s `GameCanvas`) on the bench's recorded boards. */
const meta = {
  title: "Containers/BoardViewport",
  component: BoardViewport,
  args: { tiles: BOARD_38.tiles, basePath: RENDERER_ASSETS },
  decorators: [(Story) => <div className="relative h-dvh"><Story /></div>],
} satisfies Meta<typeof BoardViewport>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Board38: Story = {};
export const Board72: Story = { args: { tiles: BOARD_72.tiles } };
export const PendingTile: Story = { args: { tiles: [...BOARD_38.tiles, { ...BOARD_38.next, pending: true }] } };
