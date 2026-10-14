import type { Meta, StoryObj } from "@storybook/react-vite";
import { TileChip } from "./tile-chip";

const meta = { title: "Elements/TileChip", component: TileChip, parameters: { layout: "padded" }, args: { plan: 13, orientation: 1, size: "lg" } } satisfies Meta<typeof TileChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Selected: Story = { args: { state: "selected" } };
/** A move sent, its receipt awaited. */
export const Pending: Story = { args: { state: "pending" } };
export const Refused: Story = { args: { state: "refused" } };
export const Empty: Story = { args: { plan: 0 } };

/** The four orientations of one plan, a quarter turn each. */
export const Orientations: Story = {
  render: (args) => (
    <div className="flex gap-3">
      {[1, 2, 3, 4].map((o) => (
        <TileChip key={o} {...args} orientation={o} />
      ))}
    </div>
  ),
};

/** The 19 base plans (chain ids 1 to 19). */
export const AllPlans: Story = {
  render: () => (
    <div className="grid grid-cols-5 gap-3 tablet:grid-cols-10">
      {Array.from({ length: 19 }, (_, i) => (
        <TileChip key={i} plan={i + 1} size="md" />
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-end gap-3">
      {(["sm", "md", "lg"] as const).map((size) => (
        <TileChip key={size} {...args} size={size} />
      ))}
    </div>
  ),
};
