import type { Meta, StoryObj } from "@storybook/react-vite";
import { RENDERER_ASSETS, originalTileArt } from "../../mocks/assets";
import { BOARD_38 } from "../../mocks/board";
import { TileView } from "./tile-view";

/** One tile through the real renderer, framed alone: the hand's view of the tile to place. */
const meta = {
  title: "Containers/TileView",
  component: TileView,
  parameters: { layout: "centered" },
  args: { plan: BOARD_38.next.plan, orientation: 1, basePath: RENDERER_ASSETS, tileArt: originalTileArt(RENDERER_ASSETS) },
  decorators: [(Story) => <div className="size-48 overflow-hidden rounded-lg border border-border"><Story /></div>],
} satisfies Meta<typeof TileView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const North: Story = {};
export const East: Story = { args: { orientation: 2 } };
export const South: Story = { args: { orientation: 3 } };
export const West: Story = { args: { orientation: 4 } };
