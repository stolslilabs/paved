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
/** Opened: dimmed. */
export const Opened: Story = { args: { rank: "gold", open: true, size: "lg" } };
/** The large art of the Chests page (#759): a halo of the rank's colour on a chest to open. */
export const Glow: Story = {
  render: () => (
    <div className="flex items-end gap-6 p-6">
      <ChestBadge rank="bronze" size="xl" glow />
      <ChestBadge rank="silver" size="xl" glow />
      <ChestBadge rank="gold" size="xl" glow />
    </div>
  ),
};
/** The four sizes side by side. */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-end gap-3">
      <ChestBadge {...args} size="sm" />
      <ChestBadge {...args} size="md" />
      <ChestBadge {...args} size="lg" />
      <ChestBadge {...args} size="xl" />
    </div>
  ),
};
