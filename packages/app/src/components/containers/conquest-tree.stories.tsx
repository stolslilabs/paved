import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CONQUEST_PARTS } from "../../mocks/conquest";
import { ConquestTree } from "./conquest-tree";

/** The Conquest's knowledge tree: five branches of ten levels, bought with the allegiance's Knowledge. */
const meta = {
  title: "Containers/ConquestTree",
  component: ConquestTree,
  args: { onResearch: fn(), className: "max-w-sm" },
} satisfies Meta<typeof ConquestTree>;
export default meta;
type Story = StoryObj<typeof meta>;

/** An Officer's: one tap buys a level. */
export const Leads: Story = { args: CONQUEST_PARTS.tree };
/** A member's: the levels and the next costs, read only. */
export const Member: Story = { args: CONQUEST_PARTS.treeMember };
/** Past Frontiers: research is closed. */
export const Closed: Story = { args: { ...CONQUEST_PARTS.tree, open: false } };
export const Complete: Story = { args: { ...CONQUEST_PARTS.tree, levels: { roads: 10, cities: 10, forests: 10, wonders: 10, devotion: 10 }, knowledge: 0 } };
