import type { Meta, StoryObj } from "@storybook/react-vite";
import { RarityBadge } from "./rarity-badge";

/** A tile's rarity (#739), from its plan's count in the base deck's 72: 1 or 2 mythic, 3 or 4 uncommon, 5 and up common. */
const meta = {
  title: "Elements/RarityBadge",
  component: RarityBadge,
  args: { rarity: "common" },
} satisfies Meta<typeof RarityBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Common: Story = { args: { rarity: "common" } };
export const Uncommon: Story = { args: { rarity: "uncommon" } };
export const Mythic: Story = { args: { rarity: "mythic" } };
