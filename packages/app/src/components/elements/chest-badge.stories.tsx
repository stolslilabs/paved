import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChestBadge } from "./chest-badge";

/** A chest by rank (#739): basic one tile, rare one of 2, epic one of 3, in the podium's medal colours. */
const meta = {
  title: "Elements/ChestBadge",
  component: ChestBadge,
  args: { rank: "epic" },
} satisfies Meta<typeof ChestBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = { args: { rank: "basic" } };
export const Rare: Story = { args: { rank: "rare" } };
export const Epic: Story = { args: { rank: "epic" } };
/** Opened: dimmed. */
export const Opened: Story = { args: { rank: "epic", open: true, size: "lg" } };
/** The large art of the Chests page (#759): a halo of the rank's colour on a chest to open. */
export const Glow: Story = {
  render: () => (
    <div className="flex flex-wrap items-end gap-6 p-6">
      <ChestBadge rank="basic" size="xl" glow />
      <ChestBadge rank="rare" size="xl" glow />
      <ChestBadge rank="epic" size="xl" glow />
    </div>
  ),
};
/** The four sizes side by side. */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-end gap-3">
      <ChestBadge {...args} size="sm" />
      <ChestBadge {...args} size="md" />
      <ChestBadge {...args} size="lg" />
      <ChestBadge {...args} size="xl" />
    </div>
  ),
};
