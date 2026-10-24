import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChestBadge } from "./chest-badge";

/** A chest by rank (#739): bronze one tile, silver one of 2, gold one of 3, in the podium's medal colours. */
const meta = {
  title: "Elements/ChestBadge",
  component: ChestBadge,
  args: { rank: "gold" },
} satisfies Meta<typeof ChestBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Bronze: Story = { args: { rank: "bronze" } };
export const Silver: Story = { args: { rank: "silver" } };
export const Gold: Story = { args: { rank: "gold" } };
/** Opened: the lid up. */
export const Opened: Story = { args: { rank: "gold", open: true, size: "lg" } };
/** The three sizes side by side. */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-end gap-3">
      <ChestBadge {...args} size="sm" />
      <ChestBadge {...args} size="md" />
      <ChestBadge {...args} size="lg" />
    </div>
  ),
};
