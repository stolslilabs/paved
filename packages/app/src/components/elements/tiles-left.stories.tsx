import type { Meta, StoryObj } from "@storybook/react-vite";
import { TilesLeft } from "./tiles-left";

const meta = { title: "Elements/TilesLeft", component: TilesLeft, parameters: { layout: "padded" }, args: { remaining: 12, discarded: 0 } } satisfies Meta<typeof TilesLeft>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoDiscard: Story = {};
/** Discards spend tiles like placements (P3): the count says how many went that way. */
export const WithDiscards: Story = { args: { remaining: 9, discarded: 3 } };
export const LastTile: Story = { args: { remaining: 1, discarded: 2 } };
